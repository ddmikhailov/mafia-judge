import { describe, expect, it } from "vitest";
import {
  cil,
  ciw,
  compensationBase,
  compensationForGame,
  compensationI,
  type CompensationGame,
} from "./compensation-rules";

const qualifying = (redResult: CompensationGame["redResult"]): CompensationGame => ({
  role: "CIVILIAN",
  eliminationReason: "SHOT",
  nightNumber: 2,
  redResult,
});

describe("compensation", () => {
  it("uses B=2 for five games", () => expect(compensationBase(5)).toBe(2));
  it("calculates Cil and cap", () => {
    expect(cil(1)).toBe("0.25");
    expect(cil(2)).toBe("0.5");
    expect(cil(5)).toBe("0.5");
  });
  it("calculates Ciw and cap", () => {
    expect(ciw(1)).toBe("0.125");
    expect(ciw(2)).toBe("0.25");
    expect(ciw(9)).toBe("0.4");
  });
  it("does not qualify black roles or vote exits", () => {
    expect(compensationI([{ ...qualifying("LOSS"), role: "MAFIA" }, { ...qualifying("LOSS"), eliminationReason: "VOTE" }])).toBe(0);
  });
  it("assigns Ciw for RED win and Cil for RED loss", () => {
    expect(compensationForGame(qualifying("WIN"), 2)).toEqual({ kind: "CALCULATED", points: "0.25", formula: "CIW" });
    expect(compensationForGame(qualifying("LOSS"), 2)).toEqual({ kind: "CALCULATED", points: "0.5", formula: "CIL" });
  });
  it("blocks qualifying DRAW", () => expect(compensationForGame(qualifying("DRAW"), 1)).toEqual({ kind: "REQUIRES_MANUAL_DECISION" }));
  it("covers the two-kill example with compensation total 0.75", () => {
    const games = [qualifying("LOSS"), qualifying("WIN"), { ...qualifying("LOSS"), eliminationReason: "VOTE" }];
    const i = compensationI(games);
    const totals = games.map((game) => compensationForGame(game, i)).flatMap((item) => item.kind === "CALCULATED" ? [Number(item.points)] : []);
    expect(i).toBe(2);
    expect(totals.reduce((sum, value) => sum + value, 0)).toBe(0.75);
  });
});
