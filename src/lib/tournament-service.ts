import { prisma } from "@/lib/prisma";
import {
  assertSeatingCanBeConfirmed,
  buildRegeneratedSeating,
  prepareTournament,
} from "@/lib/tournament-rules";

export const DEFAULT_ORGANIZATION_ID = "default-organization";

export async function createTournament(input: { name: string; nicknames: string[] }) {
  const prepared = prepareTournament(input);

  return prisma.tournament.create({
    data: {
      name: prepared.name,
      organization: { connect: { id: DEFAULT_ORGANIZATION_ID } },
      players: {
        create: prepared.players.map((entry, index) => ({
          nicknameNormalized: entry.nicknameNormalized,
          registrationOrder: index + 1,
          player: { create: { nickname: entry.nickname } },
        })),
      },
      rounds: {
        create: prepared.rounds.map(({ number }) => ({
          number,
          game: { create: {} },
        })),
      },
    },
    select: { id: true },
  });
}

export async function regenerateSeating(roundId: string) {
  return prisma.$transaction(async (tx) => {
    const game = await tx.game.findUnique({
      where: { roundId },
      include: {
        round: {
          include: { tournament: { include: { players: { select: { playerId: true } } } } },
        },
      },
    });
    if (!game) throw new Error("Тур не найден");
    if (game.round.number > 1) {
      const previous = await tx.round.findUnique({
        where: { tournamentId_number: { tournamentId: game.round.tournamentId, number: game.round.number - 1 } },
      });
      if (previous?.status !== "COMPLETED") throw new Error("Сначала завершите предыдущий тур");
    }

    const seats = buildRegeneratedSeating(
      game.seatingStatus,
      game.round.tournament.players.map(({ playerId }) => playerId),
    );

    await tx.gameSeat.deleteMany({ where: { gameId: game.id } });
    await tx.gameSeat.createMany({ data: seats.map((seat) => ({ ...seat, gameId: game.id })) });
    await tx.game.update({ where: { id: game.id }, data: { seatingStatus: "GENERATED" } });
    await tx.round.update({ where: { id: roundId }, data: { status: "SEATING_READY" } });
  });
}

export async function confirmSeating(roundId: string) {
  return prisma.$transaction(async (tx) => {
    const game = await tx.game.findUnique({
      where: { roundId },
      include: { seats: { select: { playerId: true, seatNumber: true } }, round: true },
    });
    if (!game) throw new Error("Тур не найден");
    assertSeatingCanBeConfirmed(game.seatingStatus, game.seats);

    await tx.gameSeat.updateMany({
      where: { gameId: game.id },
      data: { role: "CIVILIAN", team: "RED" },
    });
    await tx.game.update({
      where: { id: game.id },
      data: {
        seatingStatus: "CONFIRMED",
        phase: "ROLE_ASSIGNMENT",
        subphase: "ROLE_ASSIGNMENT",
      },
    });
    await tx.tournament.update({
      where: { id: game.round.tournamentId },
      data: { status: "ACTIVE" },
    });
  });
}
