import writeExcelFile from "write-excel-file/node";
import type { CellObject, SheetData } from "write-excel-file/node";
import { prisma } from "./prisma";
import { getTournamentResults } from "./scoring-service";

const roleLabels = { CIVILIAN: "Мирный", SHERIFF: "Шериф", MAFIA: "Мафия", DON: "Дон" } as const;
const teamLabels = { RED: "Красные", BLACK: "Чёрные" } as const;
const textCell = (value: string | number | null | undefined, bold = false): CellObject => ({ value: value == null ? "" : String(value), type: String, fontWeight: bold ? "bold" : undefined });
const numberCell = (value: string | number | { toString(): string }, integer = false): CellObject => ({ value: Number(value.toString()), type: Number, format: integer ? "0" : "0.000" });
const columns = (widths: number[]) => widths.map((width) => ({ width }));

export async function buildTournamentWorkbook(tournamentId: string) {
  const tournament = await getTournamentResults(tournamentId);
  if (!tournament) throw new Error("Турнир не найден");
  if (tournament.scoringStatus !== "FINALIZED" || tournament.scores.length !== 10) throw new Error("Excel доступен только после финализации турнира");

  const playerName = new Map(tournament.players.map((entry) => [entry.playerId, entry.player.nickname]));
  const gameScores = new Map(tournament.players.map((entry) => [entry.playerId, tournament.rounds.map((round) => round.game!.scores.find((score) => score.playerId === entry.playerId)!)]));
  const totalsData: SheetData = [
    ["Место", "Игрок", "Игра 1", "Игра 2", "Игра 3", "Игра 4", "Игра 5", "Победы", "ДБ", "ТЧ", "Штрафы", "КБ", "Итого"].map((value) => textCell(value, true)),
    ...[...tournament.scores].sort((a, b) => a.finalRank! - b.finalRank!).map((score) => [
      numberCell(score.finalRank!, true), textCell(playerName.get(score.playerId)), ...gameScores.get(score.playerId)!.map((gameScore) => numberCell(gameScore.finalTotal)), numberCell(score.wins, true), numberCell(score.judgeAdditionalTotal), numberCell(score.blackTripleTotal), numberCell(score.penaltyTotal), numberCell(score.compensationTotal), numberCell(score.total),
    ]),
  ];

  const gamesData: SheetData = [["Тур", "Место", "Игрок", "Роль", "Команда", "Результат команды", "Основной балл", "ДБ", "ТЧ", "Штрафы", "КБ", "Итого"].map((value) => textCell(value, true))];
  for (const round of tournament.rounds) {
    const game = round.game!;
    for (const seat of game.seats) {
      const score = seat.score!;
      const teamResult = game.winner === "DRAW" ? "Ничья" : game.winner === seat.team ? "Победа" : "Поражение";
      gamesData.push([numberCell(round.number, true), numberCell(seat.seatNumber, true), textCell(seat.player.nickname), textCell(roleLabels[seat.role!]), textCell(teamLabels[seat.team!]), textCell(teamResult), numberCell(score.basePoints), numberCell(score.judgeAdditionalPoints), numberCell(score.blackTriplePoints), numberCell(score.penaltyPoints), numberCell(score.compensationPoints), numberCell(score.finalTotal)]);
    }
  }

  const sheets = [
    { data: totalsData, sheet: "Итоги", columns: columns([9, 22, 11, 11, 11, 11, 11, 10, 10, 10, 11, 10, 12]), stickyRowsCount: 1 },
    { data: gamesData, sheet: "Игры", columns: columns([8, 8, 22, 14, 13, 19, 15, 10, 10, 11, 10, 12]), stickyRowsCount: 1 },
  ];
  return { sheetNames: sheets.map((sheet) => sheet.sheet), rowCounts: sheets.map((sheet) => sheet.data.length), toBuffer: () => writeExcelFile(sheets).toBuffer() };
}

export async function exportTournamentXlsx(tournamentId: string) {
  const workbook = await buildTournamentWorkbook(tournamentId);
  const buffer = await workbook.toBuffer();
  await prisma.tournamentEvent.create({ data: { tournamentId, type: "XLSX_EXPORTED", payload: { sheets: workbook.sheetNames } } });
  return buffer;
}
