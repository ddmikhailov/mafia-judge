import { addScores, scoreStringFromUnits, scoreUnits, type ScoreValue } from "./scoring-rules";

export type RankingEntry = {
  playerId: string;
  total: ScoreValue;
  judgeAdditionalTotal: ScoreValue;
  penaltyTotal: ScoreValue;
  gamesPlayed: number;
  wins: number;
  firstNightKillsCount: number;
  successfulTriple3Count: number;
  successfulTriple2Count: number;
  maxNetJudgeAdditionalPerGame: ScoreValue;
  drawLotOrder?: number | null;
};

export function maxNetJudgeAdditionalPerGame(
  games: readonly { judgeAdditionalPoints: ScoreValue; penaltyPoints: ScoreValue }[],
) {
  if (games.length === 0) return "0.0";
  return scoreStringFromUnits(Math.max(...games.map((game) => scoreUnits(addScores(game.judgeAdditionalPoints, game.penaltyPoints)))));
}

export function additionalPointsEfficiency(entry: RankingEntry) {
  return { points: scoreUnits(addScores(entry.judgeAdditionalTotal, entry.penaltyTotal)), games: entry.gamesPlayed };
}

function compareNumberDescending(a: number, b: number) {
  return b - a;
}

export function compareRanking(a: RankingEntry, b: RankingEntry, includeLot = false) {
  const direct = [
    compareNumberDescending(scoreUnits(a.total), scoreUnits(b.total)),
    compareNumberDescending(scoreUnits(addScores(a.judgeAdditionalTotal, a.penaltyTotal)), scoreUnits(addScores(b.judgeAdditionalTotal, b.penaltyTotal))),
  ].find(Boolean);
  if (direct) return direct;

  const ae = additionalPointsEfficiency(a);
  const be = additionalPointsEfficiency(b);
  const efficiency = compareNumberDescending(ae.points * be.games, be.points * ae.games);
  if (efficiency) return efficiency;

  const remaining = [
    compareNumberDescending(a.wins, b.wins),
    compareNumberDescending(a.firstNightKillsCount, b.firstNightKillsCount),
    compareNumberDescending(a.successfulTriple3Count, b.successfulTriple3Count),
    compareNumberDescending(a.successfulTriple2Count, b.successfulTriple2Count),
    compareNumberDescending(scoreUnits(a.maxNetJudgeAdditionalPerGame), scoreUnits(b.maxNetJudgeAdditionalPerGame)),
  ].find(Boolean);
  if (remaining) return remaining;
  if (includeLot && a.drawLotOrder != null && b.drawLotOrder != null) return a.drawLotOrder - b.drawLotOrder;
  return 0;
}

export function rankTournament(entries: readonly RankingEntry[]) {
  const ordered = [...entries].sort((a, b) => compareRanking(a, b, true));
  const unresolvedGroups: string[][] = [];
  let current: string[] = [];
  for (let index = 0; index < ordered.length; index += 1) {
    const entry = ordered[index];
    const next = ordered[index + 1];
    current.push(entry.playerId);
    if (!next || compareRanking(entry, next) !== 0) {
      if (current.length > 1 && current.some((playerId) => entries.find((item) => item.playerId === playerId)?.drawLotOrder == null)) {
        unresolvedGroups.push(current);
      }
      current = [];
    }
  }
  return {
    ordered: ordered.map((entry, index) => ({ ...entry, finalRank: index + 1 })),
    unresolvedGroups,
    status: unresolvedGroups.length ? "REQUIRES_DRAW_LOT" as const : "FINAL" as const,
  };
}
