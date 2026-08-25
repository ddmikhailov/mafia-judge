import { scoreStringFromUnits } from "./scoring-rules";

export type CompensationGame = {
  role: "CIVILIAN" | "SHERIFF" | "MAFIA" | "DON";
  eliminationReason: string | null;
  nightNumber: number | null;
  redResult: "WIN" | "LOSS" | "DRAW";
};

export function compensationBase(distance: number) {
  if (distance !== 5) throw new Error("MVP поддерживает дистанцию ровно 5 игр");
  return 2;
}

export function isQualifyingFirstNightKill(game: CompensationGame) {
  return (game.role === "CIVILIAN" || game.role === "SHERIFF") && game.eliminationReason === "SHOT" && game.nightNumber === 2;
}

export function compensationI(games: readonly CompensationGame[]) {
  return games.filter(isQualifyingFirstNightKill).length;
}

export function cil(i: number, base = 2): string {
  return scoreStringFromUnits(Math.min(500, Math.round((i * 500) / base)));
}

export function ciw(i: number, base = 2): string {
  return scoreStringFromUnits(Math.min(400, Math.round((i * 250) / base)));
}

export type CompensationDecision =
  | { kind: "NONE"; points: "0.0" }
  | { kind: "CALCULATED"; points: string; formula: "CIL" | "CIW" }
  | { kind: "REQUIRES_MANUAL_DECISION" };

export function compensationForGame(game: CompensationGame, i: number, base = 2): CompensationDecision {
  if (!isQualifyingFirstNightKill(game)) return { kind: "NONE", points: "0.0" };
  if (game.redResult === "DRAW") return { kind: "REQUIRES_MANUAL_DECISION" };
  return game.redResult === "WIN"
    ? { kind: "CALCULATED", points: ciw(i, base), formula: "CIW" }
    : { kind: "CALCULATED", points: cil(i, base), formula: "CIL" };
}
