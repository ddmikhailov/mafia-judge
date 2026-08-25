import { describe, expect, it } from "vitest";
import {
  allowedJudgeAdditional,
  basePoints,
  sumPenaltyPoints,
  totalWithoutCompensation,
  validateJudgeAdditional,
} from "./scoring-rules";

const score = (team: "RED" | "BLACK", db: number, triple = 0) => ({
  team,
  judgeAdditionalPoints: db,
  blackTriplePoints: triple,
});

describe("game scoring", () => {
  it("calculates RED, BLACK and DRAW base points", () => {
    expect(basePoints("RED", "RED")).toBe("1.0");
    expect(basePoints("BLACK", "BLACK")).toBe("1.0");
    expect(basePoints("DRAW", "RED")).toBe("0.0");
    expect(basePoints("RED", "BLACK")).toBe("0.0");
  });

  it("exposes only allowed winner and loser DB", () => {
    expect(allowedJudgeAdditional("RED", "RED")).toContain(1.6);
    expect(allowedJudgeAdditional("RED", "BLACK")).toEqual([0, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8]);
  });

  it("rejects arbitrary DB and positive DRAW DB", () => {
    expect(() => validateJudgeAdditional("RED", [score("RED", 0.1)], false)).toThrow("недопустимое");
    expect(() => validateJudgeAdditional("DRAW", [score("RED", 0.3)], false)).toThrow("ничьей");
  });

  it("enforces game DB sum and approval", () => {
    const total36 = [score("RED", 0.8), ...Array.from({ length: 4 }, () => score("RED", 0.7))];
    expect(() => validateJudgeAdditional("RED", total36, false)).toThrow("3.5");
    expect(() => validateJudgeAdditional("RED", total36, true)).not.toThrow();
    expect(() => validateJudgeAdditional("RED", [score("RED", 1.6), ...Array.from({ length: 4 }, () => score("RED", 0.7))], true)).toThrow("4.0");
  });

  it("requires approval for 7–8 rewarded players and rejects 9", () => {
    const seven = Array.from({ length: 7 }, () => score("RED", 0.3));
    expect(() => validateJudgeAdditional("RED", seven, false)).toThrow("7–8");
    expect(() => validateJudgeAdditional("RED", seven, true)).not.toThrow();
    expect(() => validateJudgeAdditional("RED", Array.from({ length: 9 }, () => score("RED", 0.3)), true)).toThrow("8 игрокам");
  });

  it("requires approval for +1.6", () => {
    expect(() => validateJudgeAdditional("RED", [score("RED", 1.6)], false)).toThrow("+1.6");
    expect(() => validateJudgeAdditional("RED", [score("RED", 1.6)], true)).not.toThrow();
  });

  it("caps player DB plus triple at 1.2", () => {
    expect(() => validateJudgeAdditional("RED", [score("RED", 0.8, 0.55)], false)).toThrow("ТЧ");
  });

  it("sums penalties and total without compensation deterministically", () => {
    expect(sumPenaltyPoints([-0.2, -0.4, -1.2])).toBe("-1.8");
    expect(totalWithoutCompensation({ basePoints: 1, judgeAdditionalPoints: 0.3, blackTriplePoints: 0.55, penaltyPoints: -0.2 })).toBe("1.65");
  });
});
