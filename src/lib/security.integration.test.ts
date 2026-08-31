import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Only the Next request boundary is mocked; sessions, permissions, events and
// game transactions use the actual isolated database. Never opt in on production.
const request = vi.hoisted(() => ({ cookies: new Map<string, string>() }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers(),
  cookies: async () => ({
    get: (name: string) => request.cookies.has(name) ? { value: request.cookies.get(name)! } : undefined,
    set: (name: string, value: string) => request.cookies.set(name, value),
    delete: (name: string) => request.cookies.delete(name),
  }),
}));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(`REDIRECT:${url}`); } }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { prisma } from "./prisma";
import { hashPassword } from "./auth/password";
import { createSession, destroySession, getCurrentUser, requirePageUser, type AuthUser } from "./auth/session";
import { loginAction, logoutAction } from "../app/login/actions";
import { gameCommandAction, gameScoringAction, scoreOverrideAction } from "../app/actions";
import { GET as exportRoute } from "../app/api/tournaments/[id]/export/route";
import { confirmSeating, createTournament, regenerateSeating } from "./tournament-service";
import { requireGameAccess, requireTournamentAccess } from "./authorization";
import { createJudgeUser, setTournamentArchived, setTournamentJudge, setUserActive } from "./platform-service";
import { getGameSnapshot, performGameAction } from "./game-service";
import { closeGameScoring, getGameScoringSnapshot } from "./scoring-service";

const optedIn = process.env.SECURITY_INTEGRATION === "1";
if (optedIn && !["localhost", "127.0.0.1"].includes(new URL(process.env.DATABASE_URL!).hostname)) {
  throw new Error("Security integration tests require an explicitly selected local test database");
}
const form = (values: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
};

describe.runIf(optedIn)("Stage 4 database-backed security boundaries", () => {
  const suffix = randomUUID();
  const password = `test-only-${suffix}`;
  const tournamentIds: string[] = [];
  const userIds: string[] = [];
  let admin: AuthUser, head: AuthUser, judge: AuthUser;
  let tournamentId: string, otherId: string, gameId: string;

  beforeAll(async () => {
    const tournament = await createTournament({ name: `Security integration ${suffix}`, nicknames: Array.from({ length: 10 }, (_, i) => `Security ${i + 1}`) });
    tournamentId = tournament.id;
    tournamentIds.push(tournamentId);
    const other = await createTournament({ name: `Unassigned integration ${suffix}`, nicknames: Array.from({ length: 10 }, (_, i) => `Other ${i + 1}`) });
    otherId = other.id;
    tournamentIds.push(otherId);
    const { organizationId } = await prisma.tournament.findUniqueOrThrow({ where: { id: tournamentId }, select: { organizationId: true } });
    admin = await prisma.user.create({ data: { login: `admin-${suffix}`, displayName: "Test admin", role: "SUPER_ADMIN", organizationId, passwordHash: await hashPassword(password) } });
    userIds.push(admin.id);
    for (const role of ["HEAD_JUDGE", "JUDGE"] as const) {
      const created = await createJudgeUser(admin, { login: `${role}-${suffix}`, displayName: role, role, password });
      userIds.push(created.id);
      const user = await prisma.user.findUniqueOrThrow({ where: { id: created.id } });
      if (role === "HEAD_JUDGE") head = user; else judge = user;
    }
    await setTournamentJudge(head, tournamentId, judge.id, true);
    const round = await prisma.round.findFirstOrThrow({ where: { tournamentId, number: 1 }, include: { game: true } });
    gameId = round.game!.id;
    await regenerateSeating(round.id);
    await confirmSeating(round.id);
    for (const [seatNumber, role] of [[1, "DON"], [2, "MAFIA"], [3, "MAFIA"], [4, "SHERIFF"]] as const) {
      await performGameAction(gameId, { type: "ASSIGN_ROLE", seatNumber, role });
    }
    await performGameAction(gameId, { type: "START_GAME" });
    await performGameAction(gameId, { type: "ADVANCE_FIRST_NIGHT" });
    await performGameAction(gameId, { type: "ADVANCE_FIRST_NIGHT" });
  }, 60_000);
  beforeEach(() => request.cookies.clear());
  afterAll(async () => {
    const players = await prisma.tournamentPlayer.findMany({ where: { tournamentId: { in: tournamentIds } }, select: { playerId: true } });
    await prisma.tournament.deleteMany({ where: { id: { in: tournamentIds } } });
    await prisma.player.deleteMany({ where: { id: { in: players.map(p => p.playerId) } } });
    await prisma.actionRequest.deleteMany({ where: { actorUserId: { in: userIds } } });
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  it("anonymous dashboard, game mutation and Excel are protected", async () => {
    await expect(requirePageUser()).rejects.toThrow("REDIRECT:/login");
    await expect(gameCommandAction(form({ gameId, intent: "ADD_FOUL", seatNumber: "5" }))).rejects.toThrow("REDIRECT:");
    expect((await getGameSnapshot(gameId))!.seats[4].foulCount).toBe(0);
    expect((await exportRoute(new Request("http://localhost/test"), { params: Promise.resolve({ id: tournamentId }) })).status).toBe(401);
  });
  it("valid login creates a session and logout revokes it", async () => {
    await expect(loginAction({}, form({ login: admin.login, password }))).rejects.toThrow("REDIRECT:/");
    expect((await getCurrentUser())?.id).toBe(admin.id);
    await expect(logoutAction()).rejects.toThrow("REDIRECT:/login");
    expect(await getCurrentUser()).toBeNull();
    expect(await prisma.session.count({ where: { userId: admin.id, revokedAt: null } })).toBe(0);
  });
  it("wrong password and inactive account cannot log in", async () => {
    expect(await loginAction({}, form({ login: judge.login, password: "incorrect-password" }))).toHaveProperty("error");
    await setUserActive(admin, judge.id, false);
    expect(await loginAction({}, form({ login: judge.login, password }))).toHaveProperty("error");
    expect(await getCurrentUser()).toBeNull();
    await setUserActive(admin, judge.id, true);
  });
  it("session rotation revokes the old token", async () => {
    await createSession(judge.id);
    const previous = new Map(request.cookies);
    await createSession(judge.id);
    expect([...request.cookies.values()]).not.toEqual([...previous.values()]);
    await destroySession();
    for (const [key, value] of previous) request.cookies.set(key, value);
    expect(await getCurrentUser()).toBeNull();
  });
  it("JUDGE can access only assigned tournaments and their games", async () => {
    await expect(requireTournamentAccess(judge, tournamentId)).resolves.toHaveProperty("id", tournamentId);
    await expect(requireGameAccess(judge, gameId)).resolves.toHaveProperty("gameId", gameId);
    await expect(requireTournamentAccess(judge, otherId)).rejects.toMatchObject({ status: 404 });
    await createSession(judge.id);
    expect((await exportRoute(new Request("http://localhost/test"), { params: Promise.resolve({ id: otherId }) })).status).toBe(404);
  });
  it("forged JUDGE overrides and Head Judge approval are rejected at the action boundary", async () => {
    await createSession(judge.id);
    await expect(gameCommandAction(form({ gameId, intent: "MANUAL_OVERRIDE", kind: "FOUL", seatNumber: "5", value: "4", reason: "forged", actionToken: randomUUID() }))).rejects.toThrow("REDIRECT:");
    await expect(scoreOverrideAction(form({ gameId }))).rejects.toThrow("REDIRECT:");
    await expect(gameScoringAction(form({ gameId, intent: "SAVE", headJudgeApproved: "on" }))).rejects.toThrow("REDIRECT:");
    expect((await getGameSnapshot(gameId))!.seats[4].foulCount).toBe(0);
    expect(await prisma.gameEvent.count({ where: { gameId, type: "MANUAL_OVERRIDE" } })).toBe(0);
  });
  it("duplicate foul submissions apply once through the real server action", async () => {
    await createSession(judge.id);
    const input = form({ gameId, intent: "ADD_FOUL", seatNumber: "5", actionToken: randomUUID() });
    await gameCommandAction(input);
    await gameCommandAction(input);
    expect((await getGameSnapshot(gameId))!.seats[4].foulCount).toBe(1);
    expect(await prisma.gameEvent.count({ where: { gameId, type: "FOUL_ADDED", actorUserId: judge.id } })).toBe(1);
  });
  it("latest foul undo works once, preserving its original audit event", async () => {
    await performGameAction(gameId, { type: "UNDO_FOUL" }, { actorUserId: judge.id });
    expect((await getGameSnapshot(gameId))!.seats[4].foulCount).toBe(0);
    await expect(performGameAction(gameId, { type: "UNDO_FOUL" })).rejects.toThrow("Нет фола");
    expect(await prisma.gameEvent.count({ where: { gameId, type: "FOUL_ADDED" } })).toBe(1);
  });
  it("simultaneous mutations serialize and duplicate penalty tokens apply once", async () => {
    const context = { actorUserId: judge.id, actionToken: randomUUID() };
    await Promise.all([1, 2].map(() => performGameAction(gameId, { type: "ADD_PENALTY", seatNumber: 6, value: -0.2 }, context)));
    expect(await prisma.penalty.count({ where: { gameId, type: "JUDGE" } })).toBe(1);
    await Promise.all([1, 2].map(() => performGameAction(gameId, { type: "ADD_FOUL", seatNumber: 7 }, { actorUserId: judge.id, actionToken: randomUUID() })));
    expect((await getGameSnapshot(gameId))!.seats[6].foulCount).toBe(2);
  }, 20_000);
  it("HEAD_JUDGE override records actor and stale undo is rejected", async () => {
    await createSession(head.id);
    await gameCommandAction(form({ gameId, intent: "MANUAL_OVERRIDE", kind: "FOUL", seatNumber: "7", value: "0", reason: "Integration correction", actionToken: randomUUID() }));
    expect(await prisma.gameEvent.findFirst({ where: { gameId, type: "MANUAL_OVERRIDE", actorUserId: head.id, overrideReason: "Integration correction" } })).not.toBeNull();
    await expect(performGameAction(gameId, { type: "UNDO_FOUL" })).rejects.toThrow("Состояние игры изменилось");
  });
  it("archive records actor, blocks ordinary actions and preserves read access", async () => {
    await setTournamentArchived(head, tournamentId, true, "Integration archive");
    await expect(requireGameAccess(judge, gameId, { mutation: true })).rejects.toMatchObject({ code: "TOURNAMENT_ARCHIVED" });
    await expect(requireTournamentAccess(judge, tournamentId)).resolves.toHaveProperty("id", tournamentId);
    expect(await prisma.tournamentEvent.findFirst({ where: { tournamentId, type: "TOURNAMENT_ARCHIVED", actorUserId: head.id } })).not.toBeNull();
    await setTournamentArchived(head, tournamentId, false, "Integration restore");
  });
  it("accelerated game reaches SCORING and duplicate scoring close is safe", async () => {
    await createSession(head.id);
    await gameCommandAction(form({ gameId, intent: "MANUAL_OVERRIDE", kind: "WINNER", value: "RED", reason: "Accelerated integration finish", actionToken: randomUUID() }));
    await gameCommandAction(form({ gameId, intent: "CONFIRM_WINNER" }));
    expect((await getGameSnapshot(gameId))!.status).toBe("SCORING");
    const game = await getGameScoringSnapshot(gameId);
    const inputs = game.seats.map(seat => ({ gameSeatId: seat.id, judgeAdditionalPoints: "0" }));
    const context = { actorUserId: head.id, actionToken: randomUUID() };
    await closeGameScoring(gameId, inputs, false, context);
    await closeGameScoring(gameId, inputs, false, context);
    expect((await getGameSnapshot(gameId))!.status).toBe("COMPLETED");
  }, 30_000);
});
