import type { UserRole } from "../../generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { accessDenied, DomainError } from "@/lib/errors";
import type { AuthUser } from "@/lib/auth/session";

export const PRIVILEGED_ROLES: readonly UserRole[] = ["SUPER_ADMIN", "HEAD_JUDGE"];

export function requireRole(user: AuthUser, ...roles: UserRole[]) {
  if (!roles.includes(user.role)) throw accessDenied();
  return user;
}

export function canDangerousOverride(user: AuthUser) {
  return PRIVILEGED_ROLES.includes(user.role);
}

export function canApproveHeadJudge(user: AuthUser) {
  return PRIVILEGED_ROLES.includes(user.role);
}

export async function requireTournamentAccess(user: AuthUser, tournamentId: string, options: { mutation?: boolean; privileged?: boolean } = {}) {
  const tournament = await prisma.tournament.findFirst({
    where: {
      id: tournamentId,
      organizationId: user.organizationId,
      ...(user.role === "JUDGE" ? { judges: { some: { userId: user.id } } } : {}),
    },
    select: { id: true, organizationId: true, status: true, scoringStatus: true, archivedAt: true },
  });
  if (!tournament) throw accessDenied();
  if (options.privileged && !canDangerousOverride(user)) throw accessDenied();
  if (options.mutation && tournament.archivedAt) throw new DomainError("Архивный турнир доступен только для просмотра", "TOURNAMENT_ARCHIVED", 409);
  if (options.mutation && tournament.status === "FINISHED" && !options.privileged) throw new DomainError("Завершённый турнир нельзя изменить обычным действием", "TOURNAMENT_FINALIZED", 409);
  return tournament;
}

export async function requireGameAccess(user: AuthUser, gameId: string, options: { mutation?: boolean; privileged?: boolean } = {}) {
  const game = await prisma.game.findFirst({
    where: {
      id: gameId,
      round: {
        tournament: {
          organizationId: user.organizationId,
          ...(user.role === "JUDGE" ? { judges: { some: { userId: user.id } } } : {}),
        },
      },
    },
    select: { id: true, round: { select: { tournamentId: true, tournament: { select: { archivedAt: true, status: true } } } } },
  });
  if (!game) throw accessDenied();
  if (options.privileged && !canDangerousOverride(user)) throw accessDenied();
  if (options.mutation && game.round.tournament.archivedAt) throw new DomainError("Архивный турнир доступен только для просмотра", "TOURNAMENT_ARCHIVED", 409);
  if (options.mutation && game.round.tournament.status === "FINISHED" && !options.privileged) throw new DomainError("Финализированный турнир нельзя изменить обычным действием", "TOURNAMENT_FINALIZED", 409);
  return { gameId: game.id, tournamentId: game.round.tournamentId };
}

export async function requireRoundAccess(user: AuthUser, roundId: string, expectedTournamentId: string, options: { mutation?: boolean } = {}) {
  await requireTournamentAccess(user, expectedTournamentId, options);
  const round = await prisma.round.findFirst({ where: { id: roundId, tournamentId: expectedTournamentId }, select: { id: true } });
  if (!round) throw accessDenied();
  return round;
}
