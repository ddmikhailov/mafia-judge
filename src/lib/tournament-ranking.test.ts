import { describe, expect, it } from "vitest";
import { compareRanking, maxNetJudgeAdditionalPerGame, rankTournament, type RankingEntry } from "./tournament-ranking";

const entry = (playerId: string, overrides: Partial<RankingEntry> = {}): RankingEntry => ({
  playerId,
  total: 5,
  judgeAdditionalTotal: 1,
  penaltyTotal: 0,
  gamesPlayed: 5,
  wins: 2,
  firstNightKillsCount: 0,
  successfulTriple3Count: 0,
  successfulTriple2Count: 0,
  maxNetJudgeAdditionalPerGame: 0.4,
  ...overrides,
});

describe("tournament ranking", () => {
  it("uses total first", () => expect(compareRanking(entry("a", { total: 6 }), entry("b"))).toBeLessThan(0));
  it("uses judge extras plus penalties", () => expect(compareRanking(entry("a", { judgeAdditionalTotal: 1.2, penaltyTotal: -0.2 }), entry("b", { judgeAdditionalTotal: 1.1, penaltyTotal: -0.2 }))).toBeLessThan(0));
  it("uses wins", () => expect(compareRanking(entry("a", { wins: 3 }), entry("b"))).toBeLessThan(0));
  it("uses first-night kills", () => expect(compareRanking(entry("a", { firstNightKillsCount: 2 }), entry("b"))).toBeLessThan(0));
  it("uses successful triple 3 then triple 2", () => {
    expect(compareRanking(entry("a", { successfulTriple3Count: 1 }), entry("b", { successfulTriple2Count: 4 }))).toBeLessThan(0);
    expect(compareRanking(entry("a", { successfulTriple2Count: 2 }), entry("b", { successfulTriple2Count: 1 }))).toBeLessThan(0);
  });
  it("uses max net judge additional per game", () => expect(compareRanking(entry("a", { maxNetJudgeAdditionalPerGame: 0.7 }), entry("b"))).toBeLessThan(0));
  it("calculates max net judge additional separately", () => expect(maxNetJudgeAdditionalPerGame([{ judgeAdditionalPoints: 0.8, penaltyPoints: -0.2 }, { judgeAdditionalPoints: 0.4, penaltyPoints: 0 }])).toBe("0.6"));
  it("requires a real draw lot for full equality", () => {
    const result = rankTournament([entry("a"), entry("b")]);
    expect(result.status).toBe("REQUIRES_DRAW_LOT");
    expect(result.unresolvedGroups).toEqual([["a", "b"]]);
  });
  it("resolves equality using recorded lot order", () => {
    const result = rankTournament([entry("a", { drawLotOrder: 2 }), entry("b", { drawLotOrder: 1 })]);
    expect(result.status).toBe("FINAL");
    expect(result.ordered.map((item) => item.playerId)).toEqual(["b", "a"]);
  });
});
