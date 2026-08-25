import { prisma } from "./prisma";
import type { AuthUser } from "./auth/session";
import { requireRole } from "./authorization";

export async function getAuditPage(user: AuthUser, page: number, take = 20) {
  requireRole(user, "SUPER_ADMIN", "HEAD_JUDGE");
  const skip = Math.max(0, page) * take;
  const [gameEvents, tournamentEvents, gameCount, tournamentCount] = await prisma.$transaction([
    prisma.gameEvent.findMany({ where: { game: { round: { tournament: { organizationId: user.organizationId } } } }, orderBy: { createdAt: "desc" }, skip, take, include: { actor: { select: { displayName: true } }, game: { select: { id: true, round: { select: { number: true, tournament: { select: { id: true, name: true } } } } } } } }),
    prisma.tournamentEvent.findMany({ where: { tournament: { organizationId: user.organizationId } }, orderBy: { createdAt: "desc" }, skip, take, include: { actor: { select: { displayName: true } }, tournament: { select: { id: true, name: true } } } }),
    prisma.gameEvent.count({ where: { game: { round: { tournament: { organizationId: user.organizationId } } } } }),
    prisma.tournamentEvent.count({ where: { tournament: { organizationId: user.organizationId } } }),
  ]);
  return { gameEvents, tournamentEvents, page, hasNext: gameCount > skip + take || tournamentCount > skip + take };
}
