import { z } from "zod";
import { boundedComment, boundedReason, parseFiniteDecimal } from "./input-limits";
import { ROLES } from "./game-rules";

export const GAME_PHASES = ["SETUP", "ROLE_ASSIGNMENT", "NIGHT", "DAY", "VOTING", "CAR_CRASH", "FINAL_SPEECH", "PROTOCOL", "RESULT_CONFIRMATION", "SCORING"] as const;
export const GAME_SUBPHASES = ["SETUP", "ROLE_ASSIGNMENT", "AGREEMENT", "FREE_SEATING", "SPEECH", "PRIMARY", "CRASH_SPEECH", "REVOTE", "GROUP_EXIT", "SHOOTING", "DON_CHECK", "SHERIFF_CHECK", "BLACK_TRIPLE", "FINAL_SPEECH", "PROTOCOL", "RESULT_CONFIRMATION", "SCORING"] as const;

const compatible: Record<(typeof GAME_PHASES)[number], readonly (typeof GAME_SUBPHASES)[number][]> = {
  SETUP: ["SETUP"], ROLE_ASSIGNMENT: ["ROLE_ASSIGNMENT"], NIGHT: ["AGREEMENT", "FREE_SEATING", "SHOOTING", "DON_CHECK", "SHERIFF_CHECK", "BLACK_TRIPLE"], DAY: ["SPEECH"], VOTING: ["PRIMARY", "REVOTE", "GROUP_EXIT"], CAR_CRASH: ["CRASH_SPEECH"], FINAL_SPEECH: ["FINAL_SPEECH"], PROTOCOL: ["PROTOCOL"], RESULT_CONFIRMATION: ["RESULT_CONFIRMATION"], SCORING: ["SCORING"],
};

export function assertPhasePair(phase: string, subphase: string) {
  const parsedPhase = z.enum(GAME_PHASES).parse(phase);
  const parsedSubphase = z.enum(GAME_SUBPHASES).parse(subphase);
  if (!compatible[parsedPhase].includes(parsedSubphase)) throw new Error("Эта подфаза несовместима с выбранной фазой");
  return { phase: parsedPhase, subphase: parsedSubphase };
}

export function validateOverride(input: { kind: string; reason: string; seatNumber?: number; value?: string; extra?: string }) {
  const kind = z.enum(["FOUL", "ROLE", "STATUS", "PHASE", "WINNER", "CANCEL_VOTE", "PENALTY"]).parse(input.kind);
  const reason = boundedReason.parse(input.reason);
  const seatNumber = input.seatNumber === undefined ? undefined : z.number().int().min(1).max(10).parse(input.seatNumber);
  const value = input.value?.trim() || undefined;
  const extra = input.extra?.trim() || undefined;
  if (kind === "FOUL") z.coerce.number().int().min(0).max(4).parse(value);
  if (kind === "ROLE") z.enum(ROLES).parse(value);
  if (kind === "STATUS") z.enum(["ACTIVE", "ELIMINATED"]).parse(value);
  if (kind === "WINNER") z.enum(["RED", "BLACK", "DRAW"]).parse(value);
  if (kind === "PHASE") assertPhasePair(value ?? "", extra ?? "");
  if (kind === "PENALTY") {
    parseFiniteDecimal(value ?? "", { nonPositive: true });
    if (extra) boundedComment.parse(extra);
  }
  if (["FOUL", "ROLE", "STATUS", "PENALTY"].includes(kind) && seatNumber === undefined) throw new Error("Выберите игрока");
  return { kind, reason, seatNumber, value, extra };
}
