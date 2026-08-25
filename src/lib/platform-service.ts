import { prisma } from "./prisma";
import type { AuthUser } from "./auth/session";
import { requireRole, requireTournamentAccess } from "./authorization";
import { hashPassword } from "./auth/password";
import { DISPLAY_NAME_MAX, LOGIN_MAX, normalizeLogin, boundedReason } from "./input-limits";
import { DomainError } from "./errors";
import { z } from "zod";

export async function getTournamentDashboard(user: AuthUser) {
  return prisma.tournament.findMany({
    where: { organizationId: user.organizationId, ...(user.role === "JUDGE" ? { judges: { some: { userId: user.id } } } : {}) },
    orderBy: { createdAt: "desc" },
    include: {
      rounds: { select: { number: true, status: true }, orderBy: { number: "asc" } },
      judges: { include: { user: { select: { id: true, displayName: true, role: true, isActive: true } } }, orderBy: { assignedAt: "asc" } },
    },
  });
}

export async function listAssignableJudges(user: AuthUser) {
  requireRole(user, "SUPER_ADMIN", "HEAD_JUDGE");
  return prisma.user.findMany({ where: { organizationId: user.organizationId, isActive: true, role: { in: ["HEAD_JUDGE", "JUDGE"] } }, select: { id: true, displayName: true, login: true, role: true }, orderBy: { displayName: "asc" } });
}

export async function setTournamentJudge(user: AuthUser, tournamentId: string, judgeUserId: string, assigned: boolean) {
  requireRole(user, "SUPER_ADMIN", "HEAD_JUDGE");
  await requireTournamentAccess(user, tournamentId, { mutation: true, privileged: true });
  const judge = await prisma.user.findFirst({ where: { id: judgeUserId, organizationId: user.organizationId, isActive: true, role: { in: ["HEAD_JUDGE", "JUDGE"] } } });
  if (!judge) throw new DomainError("Судья не найден", "JUDGE_NOT_FOUND", 404);
  await prisma.$transaction(async (tx) => {
    if (assigned) await tx.tournamentJudge.upsert({ where: { tournamentId_userId: { tournamentId, userId: judgeUserId } }, create: { tournamentId, userId: judgeUserId }, update: {} });
    else await tx.tournamentJudge.deleteMany({ where: { tournamentId, userId: judgeUserId } });
    await tx.tournamentEvent.create({ data: { tournamentId, type: assigned ? "JUDGE_ASSIGNED" : "JUDGE_UNASSIGNED", actorUserId: user.id, payload: { judgeUserId, displayName: judge.displayName } } });
  });
}

export async function setTournamentArchived(user: AuthUser, tournamentId: string, archived: boolean, reason: string) {
  requireRole(user, "SUPER_ADMIN", "HEAD_JUDGE");
  boundedReason.parse(reason);
  const tournament = await requireTournamentAccess(user, tournamentId, { privileged: true });
  if (Boolean(tournament.archivedAt) === archived) return;
  await prisma.$transaction(async (tx) => {
    await tx.tournament.update({ where: { id: tournamentId }, data: { archivedAt: archived ? new Date() : null, archivedByUserId: archived ? user.id : null } });
    await tx.tournamentEvent.create({ data: { tournamentId, type: archived ? "TOURNAMENT_ARCHIVED" : "TOURNAMENT_UNARCHIVED", actorUserId: user.id, overrideReason: reason.trim(), payload: { old: tournament.archivedAt?.toISOString() ?? null, new: archived ? "ARCHIVED" : "ACTIVE" } } });
  });
}

const accountInput = z.object({ login: z.string().trim().min(1).max(LOGIN_MAX), displayName: z.string().trim().min(1).max(DISPLAY_NAME_MAX), role: z.enum(["HEAD_JUDGE", "JUDGE"]), password: z.string().min(12).max(200) });

export async function createJudgeUser(actor: AuthUser, input: z.input<typeof accountInput>) {
  requireRole(actor, "SUPER_ADMIN");
  const parsed = accountInput.parse(input);
  const login = normalizeLogin(parsed.login);
  if (await prisma.user.findUnique({ where: { login } })) throw new DomainError("Пользователь с таким логином уже существует", "DUPLICATE_LOGIN", 409);
  return prisma.user.create({ data: { organizationId: actor.organizationId, login, displayName: parsed.displayName, role: parsed.role, passwordHash: await hashPassword(parsed.password) }, select: { id: true } });
}

export async function setUserActive(actor: AuthUser, userId: string, isActive: boolean) {
  requireRole(actor, "SUPER_ADMIN");
  if (actor.id === userId && !isActive) throw new DomainError("Нельзя деактивировать собственную учётную запись", "SELF_DEACTIVATE", 409);
  const target = await prisma.user.findFirst({ where: { id: userId, organizationId: actor.organizationId } });
  if (!target) throw new DomainError("Пользователь не найден", "USER_NOT_FOUND", 404);
  await prisma.$transaction([prisma.user.update({ where: { id: userId }, data: { isActive } }), prisma.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } })]);
}

export async function resetUserPassword(actor: AuthUser, userId: string, password: string) {
  requireRole(actor, "SUPER_ADMIN");
  const target = await prisma.user.findFirst({ where: { id: userId, organizationId: actor.organizationId } });
  if (!target) throw new DomainError("Пользователь не найден", "USER_NOT_FOUND", 404);
  const passwordHash = await hashPassword(password);
  await prisma.$transaction([prisma.user.update({ where: { id: userId }, data: { passwordHash } }), prisma.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } })]);
}

export async function listUsers(actor: AuthUser) {
  requireRole(actor, "SUPER_ADMIN", "HEAD_JUDGE");
  return prisma.user.findMany({ where: { organizationId: actor.organizationId }, select: { id: true, login: true, displayName: true, role: true, isActive: true, createdAt: true }, orderBy: [{ isActive: "desc" }, { displayName: "asc" }] });
}
