import { prisma } from "@/lib/prisma";
import { Prisma } from "../../generated/prisma/client";
import { basePoints, scoreStringFromUnits, scoreUnits, sumPenaltyPoints, totalWithoutCompensation, validateJudgeAdditional } from "./scoring-rules";
import { compensationBase, compensationForGame, type CompensationGame } from "./compensation-rules";
import { maxNetJudgeAdditionalPerGame, rankTournament, type RankingEntry } from "./tournament-ranking";
import { boundedReason, parseFiniteDecimal } from "./input-limits";

type Tx = Prisma.TransactionClient;

const scoringGameInclude = {
  round: { include: { tournament: { include: { judges: { include: { user: { select: { id: true, displayName: true, role: true } } } } } } } },
  seats: { include: { player: true, penalties: true, score: true }, orderBy: { seatNumber: "asc" as const } },
  blackTriple: true,
  scores: true,
  events: { orderBy: { createdAt: "desc" as const }, take: 30 },
} satisfies Prisma.GameInclude;

async function gameAudit(tx: Tx, gameId: string, type: string, payload: Prisma.InputJsonValue, reason?: string, actorUserId?: string) {
  await tx.gameEvent.create({ data: { gameId, type, payload, overrideReason: reason, actorUserId } });
}

async function tournamentAudit(tx: Tx, tournamentId: string, type: string, payload: Prisma.InputJsonValue, reason?: string, actorUserId?: string) {
  await tx.tournamentEvent.create({ data: { tournamentId, type, payload, overrideReason: reason, actorUserId } });
}

type MutationContext = { actorUserId?: string; actionToken?: string };

async function lockScope(tx: Tx, scopeId: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${scopeId}, 0))`;
}

async function consumeActionToken(tx: Tx, scopeType: string, scopeId: string, actionType: string, context: MutationContext) {
  if (!context.actionToken) return false;
  if (!context.actorUserId) throw new Error("Для идемпотентного действия требуется actor");
  const previous = await tx.actionRequest.findUnique({ where: { token: context.actionToken } });
  if (previous) {
    if (previous.actorUserId !== context.actorUserId || previous.scopeId !== scopeId || previous.actionType !== actionType) throw new Error("Недопустимое повторное использование токена действия");
    return true;
  }
  await tx.actionRequest.create({ data: { token: context.actionToken, actorUserId: context.actorUserId, scopeType, scopeId, actionType } });
  return false;
}

async function loadScoringGame(tx: Tx, gameId: string) {
  const game = await tx.game.findUnique({ where: { id: gameId }, include: scoringGameInclude });
  if (!game) throw new Error("Игра не найдена");
  if (!game.winner || !["SCORING", "COMPLETED"].includes(game.status)) throw new Error("Игра ещё не перешла к выставлению баллов");
  return game;
}

function sourceScore(game: Awaited<ReturnType<typeof loadScoringGame>>, gameSeatId: string) {
  const seat = game.seats.find((item) => item.id === gameSeatId);
  if (!seat?.team || !game.winner) throw new Error("Для scoring не хватает роли или результата игры");
  const base = basePoints(game.winner, seat.team);
  const triple = game.blackTriple?.firstKilledGameSeatId === seat.id ? game.blackTriple.calculatedPoints.toString() : "0.0";
  const penalty = sumPenaltyPoints(seat.penalties.filter((item) => !item.undoneAt).map((item) => item.value));
  return { seat, base, triple, penalty };
}

async function syncGameScores(tx: Tx, gameId: string) {
  const game = await loadScoringGame(tx, gameId);
  for (const seat of game.seats) {
    const source = sourceScore(game, seat.id);
    const existing = seat.score;
    const db = existing?.judgeAdditionalPoints.toString() ?? "0.0";
    const total = totalWithoutCompensation({ basePoints: source.base, judgeAdditionalPoints: db, blackTriplePoints: source.triple, penaltyPoints: source.penalty });
    if (existing?.isLocked) continue;
    await tx.gameScore.upsert({
      where: { gameSeatId: seat.id },
      create: {
        gameId,
        gameSeatId: seat.id,
        playerId: seat.playerId,
        basePoints: source.base,
        judgeAdditionalPoints: db,
        blackTriplePoints: source.triple,
        penaltyPoints: source.penalty,
        totalWithoutCompensation: total,
        finalTotal: total,
      },
      update: {
        basePoints: source.base,
        blackTriplePoints: source.triple,
        penaltyPoints: source.penalty,
        totalWithoutCompensation: total,
        finalTotal: total,
      },
    });
  }
}

export async function getGameScoringSnapshot(gameId: string) {
  return prisma.$transaction(async (tx) => {
    await syncGameScores(tx, gameId);
    return loadScoringGame(tx, gameId);
  });
}

export type GameScoringInput = {
  gameSeatId: string;
  judgeAdditionalPoints: string;
};

async function validateAndSaveDraft(tx: Tx, gameId: string, inputs: readonly GameScoringInput[], headJudgeApproved: boolean) {
  await syncGameScores(tx, gameId);
  const game = await loadScoringGame(tx, gameId);
  if (game.status !== "SCORING" || game.scores.some((item) => item.isLocked)) throw new Error("Закрытый scoring можно изменить только через ручную корректировку");
  if (inputs.length !== 10 || new Set(inputs.map((item) => item.gameSeatId)).size !== 10) throw new Error("Нужно сохранить баллы всех 10 игроков");
  const bySeat = new Map(inputs.map((item) => [item.gameSeatId, item.judgeAdditionalPoints]));
  if (game.seats.some((seat) => !bySeat.has(seat.id))) throw new Error("Состав scoring не соответствует рассадке");
  validateJudgeAdditional(
    game.winner!,
    game.seats.map((seat) => ({
      team: seat.team!,
      judgeAdditionalPoints: bySeat.get(seat.id)!,
      blackTriplePoints: sourceScore(game, seat.id).triple,
    })),
    headJudgeApproved,
  );
  for (const seat of game.seats) {
    const source = sourceScore(game, seat.id);
    const db = bySeat.get(seat.id)!;
    const total = totalWithoutCompensation({ basePoints: source.base, judgeAdditionalPoints: db, blackTriplePoints: source.triple, penaltyPoints: source.penalty });
    await tx.gameScore.update({
      where: { gameSeatId: seat.id },
      data: { judgeAdditionalPoints: db, headJudgeApproved, totalWithoutCompensation: total, finalTotal: total },
    });
  }
  return game;
}

export async function saveGameScoring(gameId: string, inputs: readonly GameScoringInput[], headJudgeApproved: boolean, context: MutationContext = {}) {
  return prisma.$transaction(async (tx) => {
    await lockScope(tx, gameId);
    const game = await validateAndSaveDraft(tx, gameId, inputs, headJudgeApproved);
    if (headJudgeApproved && !game.scores.some((score) => score.headJudgeApproved)) {
      await gameAudit(tx, gameId, "HEAD_JUDGE_APPROVAL", { approved: true }, undefined, context.actorUserId);
    }
    await gameAudit(tx, gameId, "SCORING_SAVED", { headJudgeApproved, scores: inputs } as Prisma.InputJsonValue, undefined, context.actorUserId);
  });
}

export async function closeGameScoring(gameId: string, inputs: readonly GameScoringInput[], headJudgeApproved: boolean, context: MutationContext = {}) {
  return prisma.$transaction(async (tx) => {
    await lockScope(tx, gameId);
    if (await consumeActionToken(tx, "GAME", gameId, "CLOSE_SCORING", context)) return { duplicate: true };
    const current = await tx.game.findUnique({ where: { id: gameId }, select: { status: true } });
    if (current?.status === "COMPLETED") return { duplicate: true };
    const game = await validateAndSaveDraft(tx, gameId, inputs, headJudgeApproved);
    if (headJudgeApproved && !game.scores.some((score) => score.headJudgeApproved)) {
      await gameAudit(tx, gameId, "HEAD_JUDGE_APPROVAL", { approved: true }, undefined, context.actorUserId);
    }
    await gameAudit(tx, gameId, "SCORING_SAVED", { headJudgeApproved, scores: inputs, closing: true } as Prisma.InputJsonValue, undefined, context.actorUserId);
    const scores = await tx.gameScore.findMany({ where: { gameId } });
    if (scores.length !== 10) throw new Error("Scoring должен содержать 10 игроков");
    await tx.gameScore.updateMany({ where: { gameId }, data: { isLocked: true } });
    await tx.game.update({ where: { id: gameId }, data: { status: "COMPLETED" } });
    await tx.round.update({ where: { id: game.roundId }, data: { status: "COMPLETED" } });
    const completed = await tx.round.count({ where: { tournamentId: game.round.tournamentId, status: "COMPLETED" } });
    await tx.tournament.update({
      where: { id: game.round.tournamentId },
      data: { scoringStatus: completed === 5 ? "READY_TO_FINALIZE" : "ACTIVE" },
    });
    await gameAudit(tx, gameId, "GAME_SCORE_LOCKED", { scoreCount: scores.length }, undefined, context.actorUserId);
    await gameAudit(tx, gameId, "ROUND_COMPLETED", { roundNumber: game.round.number }, undefined, context.actorUserId);
    return { duplicate: false };
  });
}

export async function overrideGameScore(input: {
  gameId: string;
  gameSeatId: string;
  judgeAdditionalPoints: string;
  penaltyValue?: string;
  manualCompensationPoints?: string;
  reason: string;
}, context: MutationContext = {}) {
  return prisma.$transaction(async (tx) => {
    await lockScope(tx, input.gameId);
    if (await consumeActionToken(tx, "GAME", input.gameId, "SCORE_OVERRIDE", context)) return { duplicate: true };
    const reason = boundedReason.parse(input.reason);
    input.judgeAdditionalPoints = parseFiniteDecimal(input.judgeAdditionalPoints, { maxAbs: 4 });
    if (input.penaltyValue) input.penaltyValue = parseFiniteDecimal(input.penaltyValue, { nonPositive: true });
    if (input.manualCompensationPoints) input.manualCompensationPoints = parseFiniteDecimal(input.manualCompensationPoints, { maxAbs: 10 });
    const game = await loadScoringGame(tx, input.gameId);
    if (game.status !== "COMPLETED") throw new Error("Ручная корректировка доступна после закрытия игры");
    const target = game.seats.find((seat) => seat.id === input.gameSeatId);
    if (!target?.score) throw new Error("Баллы игрока не найдены");
    if (input.penaltyValue && scoreUnits(input.penaltyValue) !== 0) {
      await tx.penalty.create({ data: { gameId: game.id, gameSeatId: target.id, value: input.penaltyValue, type: "SCORING_OVERRIDE", isOverride: true, comment: reason } });
    }
    if (input.manualCompensationPoints) scoreUnits(input.manualCompensationPoints);
    const freshPenalties = await tx.penalty.findMany({ where: { gameSeatId: target.id, undoneAt: null } });
    const penalty = sumPenaltyPoints(freshPenalties.map((item) => item.value));
    const source = sourceScore(game, target.id);
    const candidates = game.seats.map((seat) => ({
      team: seat.team!,
      judgeAdditionalPoints: seat.id === target.id ? input.judgeAdditionalPoints : seat.score!.judgeAdditionalPoints,
      blackTriplePoints: sourceScore(game, seat.id).triple,
    }));
    validateJudgeAdditional(game.winner!, candidates, true);
    const total = totalWithoutCompensation({ basePoints: source.base, judgeAdditionalPoints: input.judgeAdditionalPoints, blackTriplePoints: source.triple, penaltyPoints: penalty });
    await tx.gameScore.update({
      where: { gameSeatId: target.id },
      data: {
        judgeAdditionalPoints: input.judgeAdditionalPoints,
        penaltyPoints: penalty,
        manualCompensationPoints: input.manualCompensationPoints ?? target.score.manualCompensationPoints,
        totalWithoutCompensation: total,
        finalTotal: total,
        headJudgeApproved: true,
      },
    });
    await gameAudit(tx, game.id, "GAME_SCORE_OVERRIDDEN", {
      gameSeatId: target.id,
      old: { judgeAdditionalPoints: target.score.judgeAdditionalPoints.toString(), penaltyPoints: target.score.penaltyPoints.toString(), manualCompensationPoints: target.score.manualCompensationPoints?.toString() ?? null },
      new: { judgeAdditionalPoints: input.judgeAdditionalPoints, penaltyPoints: penalty, manualCompensationPoints: input.manualCompensationPoints ?? target.score.manualCompensationPoints?.toString() ?? null },
    }, reason, context.actorUserId);
    await tx.tournament.update({ where: { id: game.round.tournamentId }, data: { scoringStatus: "NEEDS_RECALCULATION", finalizedAt: null, status: "ACTIVE" } });
    await tournamentAudit(tx, game.round.tournamentId, "TOURNAMENT_FINALIZATION_INVALIDATED", { gameId: game.id, gameSeatId: target.id }, reason, context.actorUserId);
    return { duplicate: false };
  });
}

const finalizationInclude = {
  players: { include: { player: true }, orderBy: { registrationOrder: "asc" as const } },
  rounds: {
    orderBy: { number: "asc" as const },
    include: {
      game: {
        include: {
          seats: { include: { player: true, score: true }, orderBy: { seatNumber: "asc" as const } },
          scores: true,
          nightActions: true,
          blackTriple: true,
        },
      },
    },
  },
  scores: true,
} satisfies Prisma.TournamentInclude;

type FinalizationTournament = NonNullable<Awaited<ReturnType<typeof loadTournamentForFinalization>>>;

async function loadTournamentForFinalization(tx: Tx, tournamentId: string) {
  return tx.tournament.findUnique({ where: { id: tournamentId }, include: finalizationInclude });
}

function firstNightKillForPlayer(game: NonNullable<FinalizationTournament["rounds"][number]["game"]>, playerId: string) {
  const shot = game.nightActions.find((action) => action.type === "SHOT" && action.nightNumber === 2 && action.result === "KILL" && !action.undoneAt);
  const seat = game.seats.find((item) => item.playerId === playerId);
  return Boolean(shot && seat && shot.targetSeat === seat.seatNumber && (seat.role === "CIVILIAN" || seat.role === "SHERIFF"));
}

function redResult(winner: "RED" | "BLACK" | "DRAW"): CompensationGame["redResult"] {
  return winner === "RED" ? "WIN" : winner === "BLACK" ? "LOSS" : "DRAW";
}

export async function getTournamentResults(tournamentId: string) {
  return prisma.tournament.findUnique({
    where: { id: tournamentId },
    include: {
      ...finalizationInclude,
      judges: { include: { user: { select: { id: true, displayName: true, role: true, isActive: true } } }, orderBy: { assignedAt: "asc" } },
      events: { orderBy: { createdAt: "desc" }, take: 30 },
    },
  });
}

export async function finalizeTournament(tournamentId: string, context: MutationContext = {}) {
  return prisma.$transaction(async (tx) => {
    await lockScope(tx, tournamentId);
    if (await consumeActionToken(tx, "TOURNAMENT", tournamentId, "FINALIZE_TOURNAMENT", context)) return { status: "DUPLICATE" as const };
    const tournament = await loadTournamentForFinalization(tx, tournamentId);
    if (!tournament) throw new Error("Турнир не найден");
    if (tournament.status === "FINISHED" && tournament.scoringStatus === "FINALIZED") return { status: "FINALIZED" as const };
    if (tournament.archivedAt) throw new Error("Архивный турнир нельзя финализировать");
    await tournamentAudit(tx, tournamentId, "TOURNAMENT_FINALIZATION_STARTED", {}, undefined, context.actorUserId);
    if (tournament.players.length !== 10 || tournament.rounds.length !== 5 || tournament.rounds.some((round) => round.status !== "COMPLETED" || round.game?.status !== "COMPLETED" || round.game.scores.length !== 10)) {
      await tournamentAudit(tx, tournamentId, "TOURNAMENT_FINALIZATION_BLOCKED", { reason: "INCOMPLETE_GAMES" }, undefined, context.actorUserId);
      return { status: "INCOMPLETE_GAMES" as const };
    }

    const base = compensationBase(tournament.compensationDistance);
    const unresolved: Array<{ playerId: string; nickname: string; gameId: string; roundNumber: number; gameSeatId: string }> = [];
    const calculatedByPlayer = new Map<string, { i: number; games: Array<{ scoreId: string; points: string }> }>();

    for (const entry of tournament.players) {
      const qualifyingGames = tournament.rounds.filter((round) => firstNightKillForPlayer(round.game!, entry.playerId));
      const i = qualifyingGames.length;
      const games: Array<{ scoreId: string; points: string }> = [];
      for (const round of tournament.rounds) {
        const game = round.game!;
        const seat = game.seats.find((item) => item.playerId === entry.playerId)!;
        const score = seat.score!;
        const decision = compensationForGame({
          role: seat.role!,
          eliminationReason: firstNightKillForPlayer(game, entry.playerId) ? "SHOT" : seat.eliminationReason,
          nightNumber: firstNightKillForPlayer(game, entry.playerId) ? 2 : null,
          redResult: redResult(game.winner!),
        }, i, base);
        if (decision.kind === "REQUIRES_MANUAL_DECISION") {
          if (score.manualCompensationPoints == null) unresolved.push({ playerId: entry.playerId, nickname: entry.player.nickname, gameId: game.id, roundNumber: round.number, gameSeatId: seat.id });
          games.push({ scoreId: score.id, points: score.manualCompensationPoints?.toString() ?? "0.0" });
        } else games.push({ scoreId: score.id, points: decision.points });
      }
      calculatedByPlayer.set(entry.playerId, { i, games });
    }

    if (unresolved.length) {
      await tx.tournament.update({ where: { id: tournamentId }, data: { scoringStatus: "REQUIRES_MANUAL_DECISION", finalizedAt: null } });
      await tournamentAudit(tx, tournamentId, "TOURNAMENT_FINALIZATION_BLOCKED", { reason: "DRAW_COMPENSATION", unresolved } as Prisma.InputJsonValue, undefined, context.actorUserId);
      return { status: "REQUIRES_MANUAL_DECISION" as const, unresolved };
    }

    for (const data of calculatedByPlayer.values()) {
      for (const game of data.games) {
        const score = tournament.rounds.flatMap((round) => round.game!.scores).find((item) => item.id === game.scoreId)!;
        await tx.gameScore.update({ where: { id: game.scoreId }, data: { compensationPoints: game.points, finalTotal: scoreStringFromUnits(scoreUnits(score.totalWithoutCompensation) + scoreUnits(game.points)) } });
      }
    }
    await tournamentAudit(tx, tournamentId, "COMPENSATION_CALCULATED", {
      players: [...calculatedByPlayer].map(([playerId, value]) => ({ playerId, i: value.i, compensation: scoreStringFromUnits(value.games.reduce((sum, game) => sum + scoreUnits(game.points), 0)) })),
    } as Prisma.InputJsonValue, undefined, context.actorUserId);

    const rankingEntries: RankingEntry[] = [];
    for (const entry of tournament.players) {
      const playerGames = tournament.rounds.map((round) => {
        const game = round.game!;
        const seat = game.seats.find((item) => item.playerId === entry.playerId)!;
        const score = seat.score!;
        const compensation = calculatedByPlayer.get(entry.playerId)!.games.find((item) => item.scoreId === score.id)!.points;
        return { game, seat, score, compensation };
      });
      const existing = tournament.scores.find((item) => item.playerId === entry.playerId);
      const aggregate = {
        playerId: entry.playerId,
        baseTotal: scoreStringFromUnits(playerGames.reduce((sum, item) => sum + scoreUnits(item.score.basePoints), 0)),
        judgeAdditionalTotal: scoreStringFromUnits(playerGames.reduce((sum, item) => sum + scoreUnits(item.score.judgeAdditionalPoints), 0)),
        blackTripleTotal: scoreStringFromUnits(playerGames.reduce((sum, item) => sum + scoreUnits(item.score.blackTriplePoints), 0)),
        penaltyTotal: scoreStringFromUnits(playerGames.reduce((sum, item) => sum + scoreUnits(item.score.penaltyPoints), 0)),
        compensationTotal: scoreStringFromUnits(playerGames.reduce((sum, item) => sum + scoreUnits(item.compensation), 0)),
        total: scoreStringFromUnits(playerGames.reduce((sum, item) => sum + scoreUnits(item.score.totalWithoutCompensation) + scoreUnits(item.compensation), 0)),
        wins: playerGames.filter(({ game, seat }) => game.winner !== "DRAW" && game.winner === seat.team).length,
        gamesPlayed: playerGames.length,
        firstNightKillsCount: calculatedByPlayer.get(entry.playerId)!.i,
        successfulTriple3Count: playerGames.filter(({ game, seat }) => game.blackTriple?.firstKilledGameSeatId === seat.id && game.blackTriple.correctBlackCount === 3).length,
        successfulTriple2Count: playerGames.filter(({ game, seat }) => game.blackTriple?.firstKilledGameSeatId === seat.id && game.blackTriple.correctBlackCount === 2).length,
        maxNetJudgeAdditionalPerGame: maxNetJudgeAdditionalPerGame(playerGames.map(({ score }) => ({ judgeAdditionalPoints: score.judgeAdditionalPoints, penaltyPoints: score.penaltyPoints }))),
        drawLotOrder: existing?.drawLotOrder,
      };
      rankingEntries.push(aggregate);
      await tx.tournamentScore.upsert({
        where: { tournamentId_playerId: { tournamentId, playerId: entry.playerId } },
        create: { tournamentId, ...aggregate, rankingStatus: "PROVISIONAL" },
        update: { ...aggregate, finalRank: null, rankingStatus: "PROVISIONAL" },
      });
    }

    const ranking = rankTournament(rankingEntries);
    if (ranking.status === "REQUIRES_DRAW_LOT") {
      await tx.tournamentScore.updateMany({ where: { tournamentId }, data: { rankingStatus: "REQUIRES_DRAW_LOT", finalRank: null } });
      await tx.tournament.update({ where: { id: tournamentId }, data: { scoringStatus: "REQUIRES_DRAW_LOT", finalizedAt: null } });
      await tournamentAudit(tx, tournamentId, "TOURNAMENT_FINALIZATION_BLOCKED", { reason: "DRAW_LOT", groups: ranking.unresolvedGroups }, undefined, context.actorUserId);
      return { status: "REQUIRES_DRAW_LOT" as const, groups: ranking.unresolvedGroups };
    }

    for (const ranked of ranking.ordered) {
      await tx.tournamentScore.update({ where: { tournamentId_playerId: { tournamentId, playerId: ranked.playerId } }, data: { finalRank: ranked.finalRank, rankingStatus: "FINAL" } });
    }
    await tx.tournament.update({ where: { id: tournamentId }, data: { scoringStatus: "FINALIZED", finalizedAt: new Date(), status: "FINISHED" } });
    await tournamentAudit(tx, tournamentId, "TOURNAMENT_FINALIZED", { ranks: ranking.ordered.map((item) => ({ playerId: item.playerId, rank: item.finalRank })) }, undefined, context.actorUserId);
    return { status: "FINALIZED" as const };
  });
}

export async function overrideDrawCompensation(input: { tournamentId: string; gameSeatId: string; value: string; reason: string }, context: MutationContext = {}) {
  return prisma.$transaction(async (tx) => {
    const reason = boundedReason.parse(input.reason);
    input.value = parseFiniteDecimal(input.value, { maxAbs: 10 });
    const score = await tx.gameScore.findUnique({ where: { gameSeatId: input.gameSeatId }, include: { game: { include: { round: { include: { tournament: true } }, nightActions: true } }, gameSeat: true } });
    if (!score || score.game.round.tournamentId !== input.tournamentId) throw new Error("Баллы игрока не найдены");
    const qualifyingShot = score.game.nightActions.some((action) => action.type === "SHOT" && action.nightNumber === 2 && action.result === "KILL" && !action.undoneAt && action.targetSeat === score.gameSeat.seatNumber);
    const qualifyingRole = score.gameSeat.role === "CIVILIAN" || score.gameSeat.role === "SHERIFF";
    if (score.game.winner !== "DRAW" || !qualifyingShot || !qualifyingRole || score.game.round.tournament.scoringStatus !== "REQUIRES_MANUAL_DECISION" || score.manualCompensationPoints != null) {
      throw new Error("Ручной КБ доступен только для неразрешённого qualifying DRAW case");
    }
    const old = null;
    await tx.gameScore.update({ where: { id: score.id }, data: { manualCompensationPoints: input.value } });
    await gameAudit(tx, score.gameId, "COMPENSATION_OVERRIDDEN", { gameSeatId: input.gameSeatId, old, new: input.value }, reason, context.actorUserId);
    await tx.tournament.update({ where: { id: input.tournamentId }, data: { scoringStatus: "READY_TO_FINALIZE" } });
  });
}

export async function recordDrawLot(input: { tournamentId: string; orderedPlayerIds: string[]; reason: string }, context: MutationContext = {}) {
  return prisma.$transaction(async (tx) => {
    const reason = boundedReason.parse(input.reason);
    const scores = await tx.tournamentScore.findMany({ where: { tournamentId: input.tournamentId } });
    const ranking = rankTournament(scores.map((score) => ({ ...score, drawLotOrder: null })));
    const group = ranking.unresolvedGroups.find((items) => items.length === input.orderedPlayerIds.length && items.every((id) => input.orderedPlayerIds.includes(id)));
    if (!group || new Set(input.orderedPlayerIds).size !== group.length) throw new Error("Порядок жребия не соответствует группе равных игроков");
    for (let index = 0; index < input.orderedPlayerIds.length; index += 1) {
      await tx.tournamentScore.update({ where: { tournamentId_playerId: { tournamentId: input.tournamentId, playerId: input.orderedPlayerIds[index] } }, data: { drawLotOrder: index + 1 } });
    }
    await tournamentAudit(tx, input.tournamentId, "DRAW_LOT_RECORDED", { orderedPlayerIds: input.orderedPlayerIds }, reason, context.actorUserId);
    await tx.tournament.update({ where: { id: input.tournamentId }, data: { scoringStatus: "READY_TO_FINALIZE" } });
  });
}
