import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./auth/password";
import { requireRole, canDangerousOverride, canApproveHeadJudge } from "./authorization";
import { assertCommandAllowed, assertPendingWinnerConfirmation } from "./game-command-policy";
import { assertPhasePair, validateOverride } from "./manual-override";
import { parseFiniteDecimal } from "./input-limits";

const user = (role: "SUPER_ADMIN" | "HEAD_JUDGE" | "JUDGE") => ({
  id: role, organizationId: "default-organization", login: role.toLowerCase(),
  displayName: role, role, isActive: true,
});

describe("authentication primitives", () => {
  it("hashes and verifies a valid password", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(hash).not.toContain("correct horse");
    await expect(verifyPassword("correct horse battery staple", hash)).resolves.toBe(true);
  });

  it("rejects an invalid password", async () => {
    const hash = await hashPassword("correct horse battery staple");
    await expect(verifyPassword("different password", hash)).resolves.toBe(false);
  });

  it("rejects short passwords", () => {
    expect(() => hashPassword("short")).toThrow("от 12 до 200");
  });
});

describe("central role policy", () => {
  it("allows SUPER_ADMIN to manage users", () => expect(requireRole(user("SUPER_ADMIN"), "SUPER_ADMIN").role).toBe("SUPER_ADMIN"));
  it("rejects JUDGE from privileged actions", () => expect(() => requireRole(user("JUDGE"), "SUPER_ADMIN", "HEAD_JUDGE")).toThrow());
  it("allows HEAD_JUDGE dangerous overrides", () => expect(canDangerousOverride(user("HEAD_JUDGE"))).toBe(true));
  it("does not allow JUDGE approvals", () => expect(canApproveHeadJudge(user("JUDGE"))).toBe(false));
});

describe("game command lifecycle", () => {
  it("allows a foul only in a live game", () => expect(() => assertCommandAllowed({ status: "IN_PROGRESS", phase: "DAY", subphase: "SPEECH" }, "ADD_FOUL")).not.toThrow());
  it("rejects a foul before start", () => expect(() => assertCommandAllowed({ status: "PENDING", phase: "ROLE_ASSIGNMENT", subphase: "ROLE_ASSIGNMENT" }, "ADD_FOUL")).toThrow("недоступно"));
  it("rejects a foul after completion", () => expect(() => assertCommandAllowed({ status: "COMPLETED", phase: "SCORING", subphase: "SCORING" }, "ADD_FOUL")).toThrow("недоступно"));
  it("allows ordinary penalty during scoring", () => expect(() => assertCommandAllowed({ status: "SCORING", phase: "SCORING", subphase: "SCORING" }, "ADD_PENALTY")).not.toThrow());
  it("rejects ordinary penalty after completion", () => expect(() => assertCommandAllowed({ status: "COMPLETED", phase: "SCORING", subphase: "SCORING" }, "ADD_PENALTY")).toThrow("недоступно"));
  it("rejects winner confirmation outside result confirmation", () => expect(() => assertCommandAllowed({ status: "IN_PROGRESS", phase: "DAY", subphase: "SPEECH" }, "CONFIRM_WINNER")).toThrow("недоступно"));
  it("accepts winner confirmation in result confirmation", () => expect(() => assertCommandAllowed({ status: "IN_PROGRESS", phase: "RESULT_CONFIRMATION", subphase: "RESULT_CONFIRMATION", pendingWinner: "RED" }, "CONFIRM_WINNER")).not.toThrow());
  it("rejects replacing a pending winner", () => expect(() => assertPendingWinnerConfirmation({ status: "IN_PROGRESS", phase: "RESULT_CONFIRMATION", subphase: "RESULT_CONFIRMATION", pendingWinner: "RED" }, "BLACK")).toThrow("совпадать"));
  it("requires a pending result to continue manually", () => expect(() => assertCommandAllowed({ status: "IN_PROGRESS", phase: "RESULT_CONFIRMATION", subphase: "RESULT_CONFIRMATION", pendingWinner: null }, "CONTINUE_MANUALLY")).toThrow("Нет предложенного"));
});

describe("manual override validation", () => {
  const base = { kind: "FOUL", reason: "Исправление протокола", seatNumber: 1, value: "0" };
  it("accepts technical foul range boundaries", () => {
    expect(validateOverride(base).value).toBe("0");
    expect(validateOverride({ ...base, value: "4" }).value).toBe("4");
  });
  it("rejects negative foul", () => expect(() => validateOverride({ ...base, value: "-1" })).toThrow());
  it("rejects foul above four", () => expect(() => validateOverride({ ...base, value: "5" })).toThrow());
  it("rejects invalid role", () => expect(() => validateOverride({ ...base, kind: "ROLE", value: "BOSS" })).toThrow());
  it("rejects incompatible phase pair", () => expect(() => assertPhasePair("DAY", "SHOOTING")).toThrow("несовместима"));
  it("accepts compatible phase pair", () => expect(assertPhasePair("NIGHT", "SHOOTING")).toEqual({ phase: "NIGHT", subphase: "SHOOTING" }));
  it("rejects NaN and Infinity", () => {
    expect(() => parseFiniteDecimal("NaN")).toThrow();
    expect(() => parseFiniteDecimal("Infinity")).toThrow();
  });
  it("rejects positive penalty", () => expect(() => validateOverride({ ...base, kind: "PENALTY", value: "0.2" })).toThrow("положительным"));
  it("rejects oversized penalty", () => expect(() => validateOverride({ ...base, kind: "PENALTY", value: "-999" })).toThrow("диапазон"));
  it("requires and bounds the reason", () => {
    expect(() => validateOverride({ ...base, reason: " " })).toThrow();
    expect(() => validateOverride({ ...base, reason: "x".repeat(501) })).toThrow();
  });
});
