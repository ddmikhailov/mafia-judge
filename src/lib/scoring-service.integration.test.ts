import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { strFromU8, unzipSync } from "fflate";
import { prisma } from "./prisma";
import { createTournament, confirmSeating, regenerateSeating } from "./tournament-service";
import { allowedJudgeAdditional } from "./scoring-rules";
import { buildTournamentWorkbook, exportTournamentXlsx } from "./excel-export";
import {
  closeGameScoring,
  finalizeTournament,
  getGameScoringSnapshot,
  overrideGameScore,
  recordDrawLot,
} from "./scoring-service";
import { rankTournament } from "./tournament-ranking";

const hasDatabase = Boolean(process.env.DATABASE_URL);

describe.runIf(hasDatabase)("Stage 3 PostgreSQL services", () => {
  let tournamentId = "";
  let playerIds: string[] = [];

  beforeAll(async () => {
    const tournament = await createTournament({ name: `Stage 3 integration ${crypto.randomUUID()}`, nicknames: Array.from({ length: 10 }, (_, index) => `Integration ${index + 1}`) });
    tournamentId = tournament.id;
    playerIds = (await prisma.tournamentPlayer.findMany({ where: { tournamentId }, select: { playerId: true } })).map((entry) => entry.playerId);
  });

  afterAll(async () => {
    try {
      if (tournamentId) await prisma.tournament.delete({ where: { id: tournamentId } });
      if (playerIds.length) await prisma.player.deleteMany({ where: { id: { in: playerIds } } });
    } finally {
      await prisma.$disconnect();
    }
  });

  it("blocks incomplete finalization and non-final Excel export", async () => {
    await expect(finalizeTournament(tournamentId)).resolves.toEqual({ status: "INCOMPLETE_GAMES" });
    await expect(buildTournamentWorkbook(tournamentId)).rejects.toThrow("финализации");
  });

  it("closes five games, unlocks next rounds and finalizes idempotently", async () => {
    const rounds = await prisma.round.findMany({ where: { tournamentId }, orderBy: { number: "asc" }, include: { game: true } });
    for (const round of rounds) {
      await regenerateSeating(round.id);
      await confirmSeating(round.id);
      const gameId = round.game!.id;
      const seats = await prisma.gameSeat.findMany({ where: { gameId }, orderBy: { seatNumber: "asc" } });
      for (const seat of seats) {
        const role = seat.seatNumber === 1 ? "DON" : seat.seatNumber <= 3 ? "MAFIA" : seat.seatNumber === 4 ? "SHERIFF" : "CIVILIAN";
        const team = seat.seatNumber <= 3 ? "BLACK" : "RED";
        await prisma.gameSeat.update({ where: { id: seat.id }, data: { role, team } });
      }
      const winner = round.number % 2 ? "RED" : "BLACK";
      await prisma.game.update({ where: { id: gameId }, data: { status: "SCORING", phase: "SCORING", subphase: "SCORING", winner, finishedAt: new Date() } });
      await prisma.round.update({ where: { id: round.id }, data: { status: "SCORING" } });
      const scoring = await getGameScoringSnapshot(gameId);
      const inputs = scoring.scores.map((score, index) => {
        const seat = scoring.seats.find((item) => item.id === score.gameSeatId)!;
        const options = allowedJudgeAdditional(winner, seat.team!);
        return { gameSeatId: score.gameSeatId, judgeAdditionalPoints: index === round.number - 1 ? String(options[1] ?? 0) : "0" };
      });
      await closeGameScoring(gameId, inputs, false);
      if (round.number < 5) await expect(regenerateSeating(rounds[round.number].id)).resolves.toBeUndefined();
    }

    expect((await prisma.tournament.findUniqueOrThrow({ where: { id: tournamentId } })).scoringStatus).toBe("READY_TO_FINALIZE");
    let result = await finalizeTournament(tournamentId);
    if (result.status === "REQUIRES_DRAW_LOT") {
      const scores = await prisma.tournamentScore.findMany({ where: { tournamentId } });
      for (const group of rankTournament(scores).unresolvedGroups) {
        await recordDrawLot({ tournamentId, orderedPlayerIds: group, reason: "Integration test lot" });
      }
      result = await finalizeTournament(tournamentId);
    }
    expect(result).toEqual({ status: "FINALIZED" });
    const firstSnapshot = await prisma.tournamentScore.findMany({ where: { tournamentId }, orderBy: { finalRank: "asc" } });
    expect(firstSnapshot).toHaveLength(10);
    expect(firstSnapshot.map((score) => score.finalRank)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    await expect(finalizeTournament(tournamentId)).resolves.toEqual({ status: "FINALIZED" });
    const secondSnapshot = await prisma.tournamentScore.findMany({ where: { tournamentId }, orderBy: { finalRank: "asc" } });
    expect(secondSnapshot.map((score) => [score.playerId, score.total.toString(), score.finalRank])).toEqual(firstSnapshot.map((score) => [score.playerId, score.total.toString(), score.finalRank]));
  }, 60_000);

  it("exports both sheets and invalidates finalization after score override", async () => {
    const workbook = await buildTournamentWorkbook(tournamentId);
    expect(workbook.sheetNames).toEqual(["Итоги", "Игры"]);
    expect(workbook.rowCounts).toEqual([11, 51]);
    const buffer = await workbook.toBuffer();
    expect(buffer.byteLength).toBeGreaterThan(1000);
    const archive = unzipSync(new Uint8Array(buffer));
    const workbookXml = strFromU8(archive["xl/workbook.xml"]);
    expect(workbookXml).toContain('name="Итоги"');
    expect(workbookXml).toContain('name="Игры"');
    expect((strFromU8(archive["xl/worksheets/sheet1.xml"]).match(/<row/g) ?? [])).toHaveLength(11);
    expect((strFromU8(archive["xl/worksheets/sheet2.xml"]).match(/<row/g) ?? [])).toHaveLength(51);
    expect((await exportTournamentXlsx(tournamentId)).byteLength).toBeGreaterThan(1000);
    expect(await prisma.tournamentEvent.count({ where: { tournamentId, type: "XLSX_EXPORTED" } })).toBe(1);
    const score = await prisma.gameScore.findFirstOrThrow({ where: { game: { round: { tournamentId } } }, include: { gameSeat: true } });
    const game = await prisma.game.findUniqueOrThrow({ where: { id: score.gameId } });
    const allowed = allowedJudgeAdditional(game.winner!, score.gameSeat.team!);
    await overrideGameScore({ gameId: score.gameId, gameSeatId: score.gameSeatId, judgeAdditionalPoints: String(allowed[1] ?? 0), reason: "Integration test override" });
    expect((await prisma.tournament.findUniqueOrThrow({ where: { id: tournamentId } })).scoringStatus).toBe("NEEDS_RECALCULATION");
  }, 30_000);
});
