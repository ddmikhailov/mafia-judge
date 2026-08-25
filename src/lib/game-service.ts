import { prisma } from "@/lib/prisma";
import { Prisma } from "../../generated/prisma/client";
import {
  blackTriplePoints,
  calculateVoteOutcome,
  determineWinner,
  donCheck,
  foulOutcome,
  groupExitAllowed,
  groupExitPasses,
  isCommonDraw,
  repeatedTieTransition,
  sheriffCheck,
  teamForRole,
  validateNomination,
  validateRoleComposition,
  type Role,
  type Winner,
} from "@/lib/game-rules";
import {
  endDayTransition,
  confirmResultTransition,
  firstNightTransition,
  nextSpeechSeat,
  startNextDay,
} from "@/lib/game-state";
import { assertCommandAllowed, assertPendingWinnerConfirmation, HIGH_RISK_IDEMPOTENT_COMMANDS } from "@/lib/game-command-policy";
import { assertPhasePair, validateOverride } from "@/lib/manual-override";

type Tx = Prisma.TransactionClient;
const STALE_UNDO = "Состояние игры изменилось после этого действия. Используйте ручную корректировку.";

export type GameCommand =
  | { type: "ASSIGN_ROLE"; seatNumber: number; role: Role }
  | { type: "START_GAME" }
  | { type: "ADVANCE_FIRST_NIGHT" }
  | { type: "COMPLETE_SPEECH" }
  | { type: "ADD_FOUL"; seatNumber: number }
  | { type: "UNDO_FOUL" }
  | { type: "ADD_NOMINATION"; nomineeSeat: number }
  | { type: "UNDO_NOMINATION" }
  | { type: "RECORD_VOTE"; votes: Array<number | null> }
  | { type: "UNDO_VOTE" }
  | { type: "COMPLETE_CRASH_SPEECH" }
  | { type: "RECORD_GROUP_EXIT"; votesFor: number }
  | { type: "NIGHT_SHOT"; targetSeat: number | null }
  | { type: "DON_CHECK"; targetSeat: number }
  | { type: "SHERIFF_CHECK"; targetSeat: number }
  | { type: "BLACK_TRIPLE"; selectedSeats: number[] }
  | { type: "SKIP_BLACK_TRIPLE" }
  | { type: "UNDO_NIGHT_ACTION" }
  | { type: "COMPLETE_FINAL_SPEECH" }
  | { type: "COMPLETE_PROTOCOL" }
  | { type: "CONFIRM_WINNER"; winner?: Winner }
  | { type: "CONTINUE_MANUALLY" }
  | { type: "ADD_PENALTY"; seatNumber: number; value: number; comment?: string }
  | { type: "UNDO_PENALTY" }
  | {
      type: "MANUAL_OVERRIDE";
      kind: "FOUL" | "ROLE" | "STATUS" | "PHASE" | "WINNER" | "CANCEL_VOTE" | "PENALTY";
      reason: string;
      seatNumber?: number;
      value?: string;
      extra?: string;
    };

const gameInclude = {
  round: { include: { tournament: { include: { judges: { include: { user: { select: { id: true, displayName: true, role: true } } } } } } } },
  seats: { include: { player: true }, orderBy: { seatNumber: "asc" as const } },
  nominations: { orderBy: { order: "asc" as const } },
  voteSessions: { include: { results: true }, orderBy: { sequence: "desc" as const } },
  nightActions: { orderBy: { createdAt: "desc" as const } },
  blackTriple: true,
  penalties: { orderBy: { createdAt: "desc" as const } },
  events: { orderBy: { createdAt: "desc" as const }, take: 30 },
} satisfies Prisma.GameInclude;

export async function getGameSnapshot(gameId: string) {
  return prisma.game.findUnique({ where: { id: gameId }, include: gameInclude });
}

async function loadGame(tx: Tx, gameId: string) {
  const game = await tx.game.findUnique({ where: { id: gameId }, include: gameInclude });
  if (!game) throw new Error("Игра не найдена");
  return game;
}

async function audit(
  tx: Tx,
  gameId: string,
  type: string,
  payload: Prisma.InputJsonValue,
  overrideReason?: string,
) {
  await tx.gameEvent.create({ data: { gameId, type, payload, overrideReason } });
}

function activeSeats(game: Awaited<ReturnType<typeof loadGame>>) {
  return game.seats.filter((seat) => seat.status === "ACTIVE");
}

async function refreshWinner(tx: Tx, gameId: string) {
  const seats = await tx.gameSeat.findMany({ where: { gameId }, orderBy: { seatNumber: "asc" } });
  const pendingWinner = determineWinner(seats);
  await tx.game.update({ where: { id: gameId }, data: { pendingWinner } });
  if (pendingWinner) await audit(tx, gameId, "WINNER_PROPOSED", { winner: pendingWinner });
  return pendingWinner;
}

async function goToNight(tx: Tx, gameId: string, countQuietDay: boolean) {
  const game = await tx.game.findUniqueOrThrow({ where: { id: gameId } });
  await tx.game.update({
    where: { id: gameId },
    data: {
      phase: "NIGHT",
      subphase: "SHOOTING",
      nightNumber: game.nightNumber + 1,
      currentSpeakerSeat: null,
      quietPhaseCount: countQuietDay ? { increment: 1 } : undefined,
      exitResume: null,
    },
  });
  await audit(tx, gameId, "PHASE_CHANGED", { phase: "NIGHT", subphase: "SHOOTING" });
}

async function endNight(tx: Tx, gameId: string) {
  const game = await loadGame(tx, gameId);
  const hadKill = game.nightActions.some(
    (action) => action.nightNumber === game.nightNumber && action.type === "SHOT" && action.result === "KILL" && !action.undoneAt,
  );
  const quietPhaseCount = hadKill ? 0 : game.quietPhaseCount + 1;
  if (isCommonDraw(quietPhaseCount)) {
    await tx.game.update({
      where: { id: gameId },
      data: {
        quietPhaseCount,
        pendingWinner: "DRAW",
        phase: "RESULT_CONFIRMATION",
        subphase: "RESULT_CONFIRMATION",
      },
    });
    await audit(tx, gameId, "WINNER_PROPOSED", { winner: "DRAW", reason: "COMMON_DRAW" });
    return;
  }
  const pendingWinner = determineWinner(game.seats);
  if (pendingWinner) {
    await tx.game.update({
      where: { id: gameId },
      data: { quietPhaseCount, pendingWinner, phase: "RESULT_CONFIRMATION", subphase: "RESULT_CONFIRMATION" },
    });
    await audit(tx, gameId, "WINNER_PROPOSED", { winner: pendingWinner });
    return;
  }
  const active = activeSeats(game).map((seat) => seat.seatNumber);
  const next = startNextDay(active, game.firstSpeakerSeat ?? 1, game.dayNumber);
  await tx.game.update({ where: { id: gameId }, data: { ...next, quietPhaseCount, pendingExitSeats: [], exitResume: null } });
  await audit(tx, gameId, "PHASE_CHANGED", next);
}

async function routeAfterChecks(tx: Tx, gameId: string) {
  const game = await loadGame(tx, gameId);
  const canBlackTriple =
    game.nightNumber === 2 &&
    game.pendingExitSeats.length > 0 &&
    game.firstDayVoteExitCount < 2 &&
    !game.blackTriple;
  if (canBlackTriple) {
    await tx.game.update({ where: { id: gameId }, data: { subphase: "BLACK_TRIPLE" } });
    return;
  }
  if (game.pendingExitSeats.length > 0) {
    await tx.game.update({
      where: { id: gameId },
      data: { phase: "FINAL_SPEECH", subphase: "FINAL_SPEECH", currentSpeakerSeat: game.pendingExitSeats[0] },
    });
    return;
  }
  await endNight(tx, gameId);
}

async function afterShot(tx: Tx, gameId: string) {
  const seats = await tx.gameSeat.findMany({ where: { gameId } });
  if (seats.some((seat) => seat.role === "DON" && seat.status === "ACTIVE")) {
    await tx.game.update({ where: { id: gameId }, data: { subphase: "DON_CHECK" } });
  } else if (seats.some((seat) => seat.role === "SHERIFF" && seat.status === "ACTIVE")) {
    await tx.game.update({ where: { id: gameId }, data: { subphase: "SHERIFF_CHECK" } });
  } else {
    await routeAfterChecks(tx, gameId);
  }
}

async function eliminateByVote(tx: Tx, gameId: string, seatNumber: number, dayNumber: number) {
  const seat = await tx.gameSeat.findUniqueOrThrow({ where: { gameId_seatNumber: { gameId, seatNumber } } });
  if (seat.status !== "ACTIVE") throw new Error("Игрок уже выбыл");
  await tx.gameSeat.update({ where: { id: seat.id }, data: { status: "ELIMINATED", eliminationReason: "VOTE" } });
  await tx.game.update({
    where: { id: gameId },
    data: {
      quietPhaseCount: 0,
      pendingExitSeats: { push: seatNumber },
      exitResume: "START_NIGHT",
      phase: "FINAL_SPEECH",
      subphase: "FINAL_SPEECH",
      currentSpeakerSeat: seatNumber,
      firstDayVoteExitCount: dayNumber === 1 ? { increment: 1 } : undefined,
    },
  });
  await audit(tx, gameId, "PLAYER_ELIMINATED", { seatNumber, reason: "VOTE" });
  await refreshWinner(tx, gameId);
}

async function executeGameAction(tx: Tx, gameId: string, command: GameCommand) {
    const game = await loadGame(tx, gameId);
    assertCommandAllowed(game, command.type);
    if (command.type === "CONFIRM_WINNER") assertPendingWinnerConfirmation(game, command.winner);

    if (command.type === "ASSIGN_ROLE") {
      if (game.status !== "PENDING" || game.phase !== "ROLE_ASSIGNMENT") throw new Error("Роли уже заблокированы");
      const seat = game.seats.find((item) => item.seatNumber === command.seatNumber);
      if (!seat) throw new Error("Место не найдено");
      await tx.gameSeat.update({
        where: { id: seat.id },
        data: { role: command.role, team: teamForRole(command.role) },
      });
      await audit(tx, gameId, "ROLE_CHANGED", { seatNumber: command.seatNumber, old: seat.role, new: command.role });
      return;
    }

    if (command.type === "START_GAME") {
      if (game.seatingStatus !== "CONFIRMED" || game.phase !== "ROLE_ASSIGNMENT") throw new Error("Игра не готова к старту");
      if (!validateRoleComposition(game.seats.map((seat) => seat.role))) throw new Error("Нужны 1 Дон, 2 Мафии, 1 Шериф и 6 Мирных");
      await tx.game.update({
        where: { id: gameId },
        data: { status: "IN_PROGRESS", phase: "NIGHT", subphase: "AGREEMENT", nightNumber: 1, startedAt: new Date() },
      });
      await tx.round.update({ where: { id: game.roundId }, data: { status: "IN_PROGRESS" } });
      await audit(tx, gameId, "GAME_STARTED", { phase: "NIGHT", subphase: "AGREEMENT" });
      return;
    }

    if (command.type === "ADVANCE_FIRST_NIGHT") {
      if (game.phase !== "NIGHT" || game.nightNumber !== 1) throw new Error("Сейчас не первая ночь");
      const next = firstNightTransition(game.subphase);
      await tx.game.update({ where: { id: gameId }, data: next });
      await audit(tx, gameId, "PHASE_CHANGED", next);
      return;
    }

    if (command.type === "COMPLETE_SPEECH") {
      if (game.phase !== "DAY" || game.subphase !== "SPEECH" || game.currentSpeakerSeat === null) throw new Error("Сейчас нет дневной речи");
      const active = activeSeats(game).map((seat) => seat.seatNumber);
      const nextSpeaker = nextSpeechSeat(active, game.firstSpeakerSeat ?? 1, game.currentSpeakerSeat);
      const speaker = game.seats.find((seat) => seat.seatNumber === game.currentSpeakerSeat)!;
      if (speaker.speechRestrictionPending) {
        await tx.gameSeat.update({ where: { id: speaker.id }, data: { speechRestrictionPending: false } });
      }
      if (nextSpeaker !== null) {
        await tx.game.update({ where: { id: gameId }, data: { currentSpeakerSeat: nextSpeaker } });
        await audit(tx, gameId, "PHASE_CHANGED", { phase: "DAY", currentSpeakerSeat: nextSpeaker });
        return;
      }
      const nominations = game.nominations.filter((item) => item.dayNumber === game.dayNumber && item.status === "ACTIVE");
      const next = endDayTransition(game.dayNumber, nominations.length);
      if (next.phase === "NIGHT") {
        await goToNight(tx, gameId, game.dayNumber > 1);
      } else {
        const sequence = (game.voteSessions[0]?.sequence ?? 0) + 1;
        await tx.voteSession.create({
          data: {
            gameId,
            dayNumber: game.dayNumber,
            type: "PRIMARY",
            sequence,
            candidateSeats: nominations.map((item) => item.nomineeSeat),
          },
        });
        await tx.game.update({ where: { id: gameId }, data: { ...next, currentSpeakerSeat: null } });
        await audit(tx, gameId, "PHASE_CHANGED", next);
      }
      return;
    }

    if (command.type === "ADD_FOUL") {
      const seat = game.seats.find((item) => item.seatNumber === command.seatNumber);
      if (!seat || seat.status !== "ACTIVE") throw new Error("Фол можно дать только активному игроку");
      const outcome = foulOutcome(seat.foulCount, activeSeats(game).length);
      await tx.gameSeat.update({
        where: { id: seat.id },
        data: {
          foulCount: outcome.foulCount,
          speechRestrictionPending: outcome.speechRestrictionSeconds !== null,
          status: outcome.eliminated ? "ELIMINATED" : undefined,
          eliminationReason: outcome.eliminated ? "FOURTH_FOUL" : undefined,
        },
      });
      await audit(tx, gameId, "FOUL_ADDED", { seatNumber: seat.seatNumber, old: seat.foulCount, new: outcome.foulCount });
      if (outcome.eliminated) {
        await tx.penalty.create({ data: { gameId, gameSeatId: seat.id, value: -1.2, type: "FOURTH_FOUL" } });
        await audit(tx, gameId, "PENALTY_ADDED", { seatNumber: seat.seatNumber, value: -1.2, type: "FOURTH_FOUL" });
        await audit(tx, gameId, "PLAYER_ELIMINATED", { seatNumber: seat.seatNumber, reason: "FOURTH_FOUL" });
        if (game.phase === "DAY" || game.phase === "VOTING" || game.phase === "CAR_CRASH") {
          await tx.voteSession.updateMany({ where: { gameId, status: "OPEN" }, data: { status: "CANCELLED" } });
          await goToNight(tx, gameId, game.dayNumber > 1);
        }
        await refreshWinner(tx, gameId);
      }
      return;
    }

    if (command.type === "UNDO_FOUL") {
      const foulEvents = await tx.gameEvent.findMany({ where: { gameId, type: { in: ["FOUL_ADDED", "FOUL_UNDONE"] } }, orderBy: { createdAt: "desc" } });
      const undoneIds = new Set(foulEvents.filter((item) => item.type === "FOUL_UNDONE").map((item) => (item.payload as { sourceEventId?: string }).sourceEventId));
      const event = foulEvents.find((item) => item.type === "FOUL_ADDED" && !undoneIds.has(item.id));
      if (!event) throw new Error("Нет фола для отмены");
      const payload = event.payload as { seatNumber: number; old: number; new: number };
      const seat = game.seats.find((item) => item.seatNumber === payload.seatNumber)!;
      if (!seat || seat.foulCount !== payload.new || (payload.new >= 4 && (seat.status !== "ELIMINATED" || seat.eliminationReason !== "FOURTH_FOUL"))) throw new Error(STALE_UNDO);
      await tx.gameSeat.update({
        where: { id: seat.id },
        data: {
          foulCount: payload.old,
          speechRestrictionPending: payload.old === 3,
          status: payload.new >= 4 ? "ACTIVE" : undefined,
          eliminationReason: payload.new >= 4 ? null : undefined,
        },
      });
      if (payload.new >= 4) {
        await tx.penalty.updateMany({ where: { gameId, gameSeatId: seat.id, type: "FOURTH_FOUL", undoneAt: null }, data: { undoneAt: new Date() } });
      }
      await audit(tx, gameId, "FOUL_UNDONE", { sourceEventId: event.id, seatNumber: payload.seatNumber, restored: payload.old });
      await refreshWinner(tx, gameId);
      return;
    }

    if (command.type === "ADD_NOMINATION") {
      if (game.phase !== "DAY" || game.currentSpeakerSeat === null) throw new Error("Выставление доступно только во время речи");
      const target = game.seats.find((seat) => seat.seatNumber === command.nomineeSeat);
      if (!target || target.status !== "ACTIVE") throw new Error("Кандидат должен быть активен");
      const existing = game.nominations.filter((item) => item.dayNumber === game.dayNumber && item.status === "ACTIVE");
      validateNomination(existing, game.currentSpeakerSeat, command.nomineeSeat);
      const nomination = await tx.nomination.create({
        data: {
          gameId,
          dayNumber: game.dayNumber,
          nominatorSeat: game.currentSpeakerSeat,
          nomineeSeat: command.nomineeSeat,
          order: existing.length + 1,
        },
      });
      await audit(tx, gameId, "NOMINATION_ADDED", { nominationId: nomination.id, nominatorSeat: game.currentSpeakerSeat, nomineeSeat: command.nomineeSeat });
      return;
    }

    if (command.type === "UNDO_NOMINATION") {
      const nomination = [...game.nominations].reverse().find((item) => item.dayNumber === game.dayNumber && item.status === "ACTIVE");
      if (!nomination) throw new Error("Нет выставления для отмены");
      const source = await tx.gameEvent.findFirst({ where: { gameId, type: "NOMINATION_ADDED", payload: { path: ["nominationId"], equals: nomination.id } }, orderBy: { createdAt: "desc" } });
      if (!source) throw new Error(STALE_UNDO);
      await tx.nomination.update({ where: { id: nomination.id }, data: { status: "UNDONE" } });
      await audit(tx, gameId, "NOMINATION_UNDONE", { nominationId: nomination.id, nomineeSeat: nomination.nomineeSeat });
      return;
    }

    if (command.type === "RECORD_VOTE") {
      if (game.phase !== "VOTING" || !["PRIMARY", "REVOTE"].includes(game.subphase)) throw new Error("Сейчас нет голосования");
      const session = game.voteSessions.find((item) => item.status === "OPEN");
      if (!session) throw new Error("Сессия голосования не найдена");
      const outcome = calculateVoteOutcome(session.candidateSeats, command.votes, activeSeats(game).length);
      await tx.voteResult.createMany({
        data: session.candidateSeats.map((nomineeSeat) => ({ voteSessionId: session.id, nomineeSeat, votes: outcome.totals[nomineeSeat] })),
      });
      await tx.voteSession.update({ where: { id: session.id }, data: { status: "COMPLETED", tieSeats: outcome.kind === "TIE" ? outcome.seats : [] } });
      await audit(tx, gameId, "VOTE_RECORDED", { sessionId: session.id, type: session.type, totals: outcome.totals });
      if (outcome.kind === "WINNER") {
        await eliminateByVote(tx, gameId, outcome.seatNumber, game.dayNumber);
        return;
      }
      if (session.type === "REVOTE") {
        const previous = game.voteSessions.find((item) => item.id !== session.id && item.tieSeats.length > 0);
        const transition = repeatedTieTransition(previous?.tieSeats ?? session.candidateSeats, outcome.seats, activeSeats(game).length);
        if (transition === "NIGHT") {
          await goToNight(tx, gameId, game.dayNumber > 1);
          return;
        }
        if (transition === "GROUP_EXIT") {
          if (!groupExitAllowed(outcome.seats.length, activeSeats(game).length)) {
            await goToNight(tx, gameId, game.dayNumber > 1);
            return;
          }
          const sequence = session.sequence + 1;
          await tx.voteSession.create({ data: { gameId, dayNumber: game.dayNumber, type: "GROUP_EXIT", sequence, candidateSeats: outcome.seats } });
          await tx.game.update({ where: { id: gameId }, data: { phase: "VOTING", subphase: "GROUP_EXIT" } });
          return;
        }
      }
      await tx.game.update({
        where: { id: gameId },
        data: { phase: "CAR_CRASH", subphase: "CRASH_SPEECH", currentSpeakerSeat: outcome.seats[0] },
      });
      return;
    }

    if (command.type === "UNDO_VOTE") {
      const session = game.voteSessions.find((item) => item.status === "COMPLETED");
      if (!session) throw new Error("Нет голосования для отмены");
      const event = game.events.find((item) => item.type === "VOTE_RECORDED" && (item.payload as { sessionId?: string }).sessionId === session.id);
      const exactEvent = event ?? await tx.gameEvent.findFirst({ where: { gameId, type: "VOTE_RECORDED", payload: { path: ["sessionId"], equals: session.id } }, orderBy: { createdAt: "desc" } });
      const voteUndoEvents = await tx.gameEvent.findMany({ where: { gameId, type: "VOTE_UNDONE" } });
      if (exactEvent && voteUndoEvents.some((item) => (item.payload as { sourceEventId?: string }).sourceEventId === exactEvent.id)) {
        throw new Error("Голосование уже отменено");
      }
      if (!exactEvent || !["CAR_CRASH", "FINAL_SPEECH"].includes(game.phase)) throw new Error(STALE_UNDO);
      const eliminated = game.seats.find((seat) => seat.eliminationReason === "VOTE" && game.pendingExitSeats.includes(seat.seatNumber));
      if (eliminated) await tx.gameSeat.update({ where: { id: eliminated.id }, data: { status: "ACTIVE", eliminationReason: null } });
      await tx.voteSession.update({ where: { id: session.id }, data: { status: "CANCELLED" } });
      const replacement = await tx.voteSession.create({
        data: {
          gameId,
          dayNumber: session.dayNumber,
          type: session.type,
          sequence: (game.voteSessions[0]?.sequence ?? 0) + 1,
          candidateSeats: session.candidateSeats,
        },
      });
      await tx.game.update({
        where: { id: gameId },
        data: {
          phase: "VOTING",
          subphase: session.type === "REVOTE" ? "REVOTE" : session.type === "GROUP_EXIT" ? "GROUP_EXIT" : "PRIMARY",
          pendingExitSeats: [],
          currentSpeakerSeat: null,
          pendingWinner: null,
        },
      });
      await audit(tx, gameId, "VOTE_UNDONE", { sourceEventId: exactEvent.id, oldSessionId: session.id, newSessionId: replacement.id });
      return;
    }

    if (command.type === "COMPLETE_CRASH_SPEECH") {
      if (game.phase !== "CAR_CRASH" || game.currentSpeakerSeat === null) throw new Error("Сейчас нет речи автокатастрофы");
      const source = game.voteSessions.find((item) => item.status === "COMPLETED" && item.tieSeats.length > 0);
      if (!source) throw new Error("Набор автокатастрофы не найден");
      const index = source.tieSeats.indexOf(game.currentSpeakerSeat);
      const next = source.tieSeats[index + 1];
      if (next !== undefined) {
        await tx.game.update({ where: { id: gameId }, data: { currentSpeakerSeat: next } });
      } else {
        await tx.voteSession.create({
          data: { gameId, dayNumber: game.dayNumber, type: "REVOTE", sequence: (game.voteSessions[0]?.sequence ?? 0) + 1, candidateSeats: source.tieSeats },
        });
        await tx.game.update({ where: { id: gameId }, data: { phase: "VOTING", subphase: "REVOTE", currentSpeakerSeat: null } });
      }
      return;
    }

    if (command.type === "RECORD_GROUP_EXIT") {
      if (game.phase !== "VOTING" || game.subphase !== "GROUP_EXIT") throw new Error("Сейчас нет голосования за подъём");
      const session = game.voteSessions.find((item) => item.status === "OPEN" && item.type === "GROUP_EXIT");
      if (!session) throw new Error("Сессия не найдена");
      const passes = groupExitPasses(command.votesFor, activeSeats(game).length);
      await tx.voteResult.create({ data: { voteSessionId: session.id, nomineeSeat: 0, votes: command.votesFor } });
      await tx.voteSession.update({ where: { id: session.id }, data: { status: "COMPLETED" } });
      await audit(tx, gameId, "VOTE_RECORDED", { sessionId: session.id, type: "GROUP_EXIT", votesFor: command.votesFor, passes });
      if (!passes) {
        await goToNight(tx, gameId, game.dayNumber > 1);
        return;
      }
      for (const seatNumber of session.candidateSeats) {
        await tx.gameSeat.update({ where: { gameId_seatNumber: { gameId, seatNumber } }, data: { status: "ELIMINATED", eliminationReason: "VOTE" } });
        await audit(tx, gameId, "PLAYER_ELIMINATED", { seatNumber, reason: "VOTE" });
      }
      await tx.game.update({
        where: { id: gameId },
        data: {
          quietPhaseCount: 0,
          pendingExitSeats: session.candidateSeats,
          exitResume: "START_NIGHT",
          phase: "FINAL_SPEECH",
          subphase: "FINAL_SPEECH",
          currentSpeakerSeat: session.candidateSeats[0],
          firstDayVoteExitCount: game.dayNumber === 1 ? { increment: session.candidateSeats.length } : undefined,
        },
      });
      await refreshWinner(tx, gameId);
      return;
    }

    if (command.type === "NIGHT_SHOT") {
      if (game.phase !== "NIGHT" || game.subphase !== "SHOOTING" || game.nightNumber < 2) throw new Error("Сейчас нет ночного отстрела");
      let result = "MISS";
      if (command.targetSeat !== null) {
        const target = game.seats.find((seat) => seat.seatNumber === command.targetSeat);
        if (!target || (target.status !== "ACTIVE" && target.eliminationReason !== "FOURTH_FOUL")) {
          throw new Error("Можно отстрелить активного либо уже дисквалифицированного игрока");
        }
        result = "KILL";
        if (target.status === "ACTIVE") {
          await tx.gameSeat.update({ where: { id: target.id }, data: { status: "ELIMINATED", eliminationReason: "SHOT" } });
          await tx.game.update({ where: { id: gameId }, data: { quietPhaseCount: 0, pendingExitSeats: { push: target.seatNumber }, exitResume: "END_NIGHT" } });
          await audit(tx, gameId, "PLAYER_ELIMINATED", { seatNumber: target.seatNumber, reason: "SHOT" });
        } else {
          await tx.game.update({ where: { id: gameId }, data: { quietPhaseCount: 0 } });
        }
      }
      const action = await tx.nightAction.create({ data: { gameId, nightNumber: game.nightNumber, type: "SHOT", targetSeat: command.targetSeat, result } });
      await audit(tx, gameId, "NIGHT_SHOT", { actionId: action.id, result, targetSeat: command.targetSeat });
      if (result === "KILL") await refreshWinner(tx, gameId);
      await afterShot(tx, gameId);
      return;
    }

    if (command.type === "DON_CHECK" || command.type === "SHERIFF_CHECK") {
      const expected = command.type;
      if (game.phase !== "NIGHT" || game.subphase !== expected) throw new Error("Сейчас недоступна эта проверка");
      const target = game.seats.find((seat) => seat.seatNumber === command.targetSeat);
      if (!target || target.status !== "ACTIVE" || !target.role) throw new Error("Цель проверки должна быть активна");
      const result = command.type === "DON_CHECK" ? donCheck(target.role) : sheriffCheck(target.role);
      const action = await tx.nightAction.create({ data: { gameId, nightNumber: game.nightNumber, type: command.type, targetSeat: target.seatNumber, result } });
      await audit(tx, gameId, command.type, { actionId: action.id, targetSeat: target.seatNumber, result });
      if (command.type === "DON_CHECK") {
        const sheriffAlive = game.seats.some((seat) => seat.role === "SHERIFF" && seat.status === "ACTIVE");
        if (sheriffAlive) await tx.game.update({ where: { id: gameId }, data: { subphase: "SHERIFF_CHECK" } });
        else await routeAfterChecks(tx, gameId);
      } else {
        await routeAfterChecks(tx, gameId);
      }
      return;
    }

    if (command.type === "BLACK_TRIPLE") {
      if (game.subphase !== "BLACK_TRIPLE" || game.blackTriple) throw new Error("ТЧ сейчас недоступна");
      if (command.selectedSeats.length !== 3 || new Set(command.selectedSeats).size !== 3) throw new Error("Выберите ровно три разных места");
      const firstKilledNumber = game.pendingExitSeats[0];
      const firstKilled = game.seats.find((seat) => seat.seatNumber === firstKilledNumber);
      if (!firstKilled?.role) throw new Error("Первый убитый не найден");
      if (command.selectedSeats.some((seat) => !game.seats.some((item) => item.seatNumber === seat))) throw new Error("Неизвестное место в ТЧ");
      const correctBlackCount = command.selectedSeats.filter((seatNumber) => game.seats.find((seat) => seat.seatNumber === seatNumber)?.team === "BLACK").length;
      const points = blackTriplePoints(firstKilled.role, correctBlackCount);
      await tx.blackTriple.create({
        data: { gameId, firstKilledGameSeatId: firstKilled.id, selectedSeats: command.selectedSeats, correctBlackCount, calculatedPoints: points },
      });
      await audit(tx, gameId, "BLACK_TRIPLE_RECORDED", { selectedSeats: command.selectedSeats, correctBlackCount, calculatedPoints: points });
      await tx.game.update({ where: { id: gameId }, data: { phase: "FINAL_SPEECH", subphase: "FINAL_SPEECH", currentSpeakerSeat: firstKilledNumber } });
      return;
    }

    if (command.type === "SKIP_BLACK_TRIPLE") {
      if (game.subphase !== "BLACK_TRIPLE") throw new Error("ТЧ сейчас недоступна");
      if (game.pendingExitSeats.length > 0) {
        await tx.game.update({ where: { id: gameId }, data: { phase: "FINAL_SPEECH", subphase: "FINAL_SPEECH", currentSpeakerSeat: game.pendingExitSeats[0] } });
      } else await endNight(tx, gameId);
      return;
    }

    if (command.type === "UNDO_NIGHT_ACTION") {
      const action = game.nightActions.find((item) => !item.undoneAt);
      if (!action) throw new Error("Нет ночного действия для отмены");
      const latestAction = await tx.nightAction.findFirst({ where: { gameId, undoneAt: null }, orderBy: { createdAt: "desc" } });
      if (!latestAction || latestAction.id !== action.id || latestAction.nightNumber !== game.nightNumber) throw new Error(STALE_UNDO);
      if (action.type === "SHOT" && action.result === "KILL" && action.targetSeat !== null) {
        const target = game.seats.find((seat) => seat.seatNumber === action.targetSeat)!;
        await tx.gameSeat.update({ where: { id: target.id }, data: { status: "ACTIVE", eliminationReason: null } });
        await tx.game.update({ where: { id: gameId }, data: { pendingExitSeats: game.pendingExitSeats.filter((seat) => seat !== action.targetSeat), pendingWinner: null, phase: "NIGHT", subphase: "SHOOTING" } });
      } else {
        const subphase = action.type === "SHOT" ? "SHOOTING" : action.type;
        await tx.game.update({ where: { id: gameId }, data: { phase: "NIGHT", subphase } });
      }
      await tx.nightAction.update({ where: { id: action.id }, data: { undoneAt: new Date() } });
      await audit(tx, gameId, "NIGHT_ACTION_UNDONE", { actionId: action.id, type: action.type });
      return;
    }

    if (command.type === "COMPLETE_FINAL_SPEECH") {
      if (game.phase !== "FINAL_SPEECH") throw new Error("Сейчас нет заключительной речи");
      await tx.game.update({ where: { id: gameId }, data: { phase: "PROTOCOL", subphase: "PROTOCOL" } });
      await audit(tx, gameId, "PHASE_CHANGED", { phase: "PROTOCOL" });
      return;
    }

    if (command.type === "COMPLETE_PROTOCOL") {
      if (game.phase !== "PROTOCOL") throw new Error("Сейчас не протокол");
      const remaining = game.pendingExitSeats.slice(1);
      if (remaining.length > 0) {
        await tx.game.update({ where: { id: gameId }, data: { pendingExitSeats: remaining, phase: "FINAL_SPEECH", subphase: "FINAL_SPEECH", currentSpeakerSeat: remaining[0] } });
        return;
      }
      if (game.pendingWinner) {
        await tx.game.update({ where: { id: gameId }, data: { pendingExitSeats: [], phase: "RESULT_CONFIRMATION", subphase: "RESULT_CONFIRMATION" } });
      } else if (game.exitResume === "START_NIGHT") {
        await tx.game.update({ where: { id: gameId }, data: { pendingExitSeats: [] } });
        await goToNight(tx, gameId, game.dayNumber > 1);
      } else {
        await tx.game.update({ where: { id: gameId }, data: { pendingExitSeats: [] } });
        await endNight(tx, gameId);
      }
      return;
    }

    if (command.type === "CONFIRM_WINNER") {
      const winner = command.winner ?? game.pendingWinner;
      if (!winner) throw new Error("Победитель не выбран");
      const result = confirmResultTransition(winner);
      await tx.game.update({
        where: { id: gameId },
        data: { ...result, finishedAt: new Date() },
      });
      await tx.round.update({ where: { id: game.roundId }, data: { status: "SCORING" } });
      await audit(tx, gameId, "GAME_FINISHED", { winner });
      return;
    }

    if (command.type === "CONTINUE_MANUALLY") {
      await tx.game.update({ where: { id: gameId }, data: { pendingWinner: null } });
      if (game.phase === "RESULT_CONFIRMATION") {
        if (game.exitResume === "START_NIGHT") await goToNight(tx, gameId, game.dayNumber > 1);
        else if (game.exitResume === "END_NIGHT") await endNight(tx, gameId);
      }
      await audit(tx, gameId, "PHASE_CHANGED", { pendingWinner: null, continuedManually: true });
      return;
    }

    if (command.type === "ADD_PENALTY") {
      if (![-0.2, -0.4, -0.5, -0.7, -1.2, -1.6].includes(command.value)) throw new Error("Недопустимое значение штрафа");
      const seat = game.seats.find((item) => item.seatNumber === command.seatNumber);
      if (!seat) throw new Error("Место не найдено");
      const penalty = await tx.penalty.create({ data: { gameId, gameSeatId: seat.id, value: command.value, type: "JUDGE", comment: command.comment } });
      await audit(tx, gameId, "PENALTY_ADDED", { penaltyId: penalty.id, seatNumber: seat.seatNumber, value: command.value });
      return;
    }

    if (command.type === "UNDO_PENALTY") {
      const penalty = game.penalties.find((item) => !item.undoneAt);
      if (!penalty) throw new Error("Нет штрафа для отмены");
      const source = await tx.gameEvent.findFirst({ where: { gameId, type: "PENALTY_ADDED", payload: { path: ["penaltyId"], equals: penalty.id } }, orderBy: { createdAt: "desc" } });
      const laterScoring = source ? await tx.gameEvent.findFirst({ where: { gameId, type: { in: ["SCORING_SAVED", "GAME_SCORE_LOCKED"] }, createdAt: { gt: source.createdAt } } }) : null;
      if (!source || laterScoring) throw new Error(STALE_UNDO);
      await tx.penalty.update({ where: { id: penalty.id }, data: { undoneAt: new Date() } });
      await audit(tx, gameId, "PENALTY_UNDONE", { penaltyId: penalty.id });
      return;
    }

    if (command.type === "MANUAL_OVERRIDE") {
      const checked = validateOverride(command);
      const reason = checked.reason;
      const seat = checked.seatNumber ? game.seats.find((item) => item.seatNumber === checked.seatNumber) : undefined;
      let oldValue: unknown = null;
      let newValue: unknown = checked.value ?? null;
      if (checked.kind === "FOUL" && seat) {
        oldValue = seat.foulCount;
        const value = Number(checked.value);
        await tx.gameSeat.update({ where: { id: seat.id }, data: { foulCount: value } });
      } else if (checked.kind === "ROLE" && seat && checked.value) {
        oldValue = seat.role;
        const role = checked.value as Role;
        await tx.gameSeat.update({ where: { id: seat.id }, data: { role, team: teamForRole(role) } });
      } else if (checked.kind === "STATUS" && seat && checked.value) {
        oldValue = seat.status;
        const status = checked.value as "ACTIVE" | "ELIMINATED";
        await tx.gameSeat.update({ where: { id: seat.id }, data: { status, eliminationReason: status === "ELIMINATED" ? "MANUAL" : null } });
        await refreshWinner(tx, gameId);
      } else if (checked.kind === "PHASE" && checked.value && checked.extra) {
        oldValue = { phase: game.phase, subphase: game.subphase };
        const pair = assertPhasePair(checked.value, checked.extra);
        newValue = pair;
        await tx.game.update({ where: { id: gameId }, data: pair });
      } else if (checked.kind === "WINNER" && checked.value) {
        oldValue = game.pendingWinner;
        await tx.game.update({ where: { id: gameId }, data: { pendingWinner: checked.value as Winner, phase: "RESULT_CONFIRMATION", subphase: "RESULT_CONFIRMATION" } });
      } else if (checked.kind === "CANCEL_VOTE") {
        const open = game.voteSessions.find((item) => item.status === "OPEN");
        oldValue = open?.id ?? null;
        newValue = "CANCELLED";
        if (open) await tx.voteSession.update({ where: { id: open.id }, data: { status: "CANCELLED" } });
        await goToNight(tx, gameId, game.dayNumber > 1);
      } else if (checked.kind === "PENALTY" && seat) {
        const value = Number(checked.value);
        await tx.penalty.create({ data: { gameId, gameSeatId: seat.id, value, type: "CUSTOM", comment: checked.extra, isOverride: true } });
        newValue = value;
      } else {
        throw new Error("Недостаточно данных для корректировки");
      }
      await audit(
        tx,
        gameId,
        "MANUAL_OVERRIDE",
        { kind: checked.kind, seatNumber: checked.seatNumber ?? null, old: oldValue, new: newValue } as Prisma.InputJsonValue,
        reason,
      );
      return;
    }

    command satisfies never;
}

export async function performGameAction(
  gameId: string,
  command: GameCommand,
  context: { actorUserId?: string; actionToken?: string } = {},
) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${gameId}, 0))`;
    if (context.actionToken && HIGH_RISK_IDEMPOTENT_COMMANDS.has(command.type)) {
      const previous = await tx.actionRequest.findUnique({ where: { token: context.actionToken } });
      if (previous) {
        if (previous.actorUserId !== context.actorUserId || previous.scopeId !== gameId || previous.actionType !== command.type) throw new Error("Недопустимое повторное использование токена действия");
        return { duplicate: true };
      }
      if (!context.actorUserId) throw new Error("Для идемпотентного действия требуется actor");
      await tx.actionRequest.create({ data: { token: context.actionToken, actorUserId: context.actorUserId, scopeType: "GAME", scopeId: gameId, actionType: command.type } });
    }
    const existingEventIds = new Set((await tx.gameEvent.findMany({ where: { gameId }, select: { id: true } })).map((event) => event.id));
    await executeGameAction(tx, gameId, command);
    if (context.actorUserId) {
      const newEvents = await tx.gameEvent.findMany({ where: { gameId, actorUserId: null }, select: { id: true } });
      const ids = newEvents.filter((event) => !existingEventIds.has(event.id)).map((event) => event.id);
      if (ids.length) await tx.gameEvent.updateMany({ where: { id: { in: ids } }, data: { actorUserId: context.actorUserId } });
    }
    await tx.game.update({ where: { id: gameId }, data: { version: { increment: 1 } } });
    return { duplicate: false };
  });
}
