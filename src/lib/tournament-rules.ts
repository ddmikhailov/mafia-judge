import { randomInt } from "node:crypto";
import { z } from "zod";
import { NICKNAME_MAX, TOURNAMENT_NAME_MAX } from "./input-limits";

export const PLAYER_COUNT = 10;
export const ROUND_COUNT = 5;

const tournamentSchema = z.object({
  name: z.string().trim().min(1, "Введите название миникапа").max(TOURNAMENT_NAME_MAX, `Название не может быть длиннее ${TOURNAMENT_NAME_MAX} символов`),
  nicknames: z
    .array(z.string().trim().min(1, "Ник не может быть пустым").max(NICKNAME_MAX, `Ник не может быть длиннее ${NICKNAME_MAX} символов`))
    .length(PLAYER_COUNT, `Нужно ровно ${PLAYER_COUNT} игроков`),
});

export type PreparedTournament = {
  name: string;
  players: Array<{ nickname: string; nicknameNormalized: string }>;
  rounds: Array<{ number: number }>;
};

export function normalizeNickname(nickname: string) {
  return nickname.trim().toLocaleLowerCase("ru-RU");
}

export function prepareTournament(input: unknown): PreparedTournament {
  const parsed = tournamentSchema.parse(input);
  const players = parsed.nicknames.map((nickname) => ({
    nickname,
    nicknameNormalized: normalizeNickname(nickname),
  }));

  if (new Set(players.map((player) => player.nicknameNormalized)).size !== PLAYER_COUNT) {
    throw new z.ZodError([
      {
        code: "custom",
        message: "Ники должны быть уникальными без учёта регистра и пробелов",
        path: ["nicknames"],
      },
    ]);
  }

  return {
    name: parsed.name,
    players,
    rounds: Array.from({ length: ROUND_COUNT }, (_, index) => ({ number: index + 1 })),
  };
}

type RandomIndex = (maxExclusive: number) => number;

export function secureShuffle<T>(values: readonly T[], nextIndex: RandomIndex = randomInt): T[] {
  const shuffled = [...values];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = nextIndex(index + 1);
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

export type SeatAssignment = { playerId: string; seatNumber: number };

export function buildRegeneratedSeating(
  seatingStatus: "PENDING" | "GENERATED" | "CONFIRMED",
  playerIds: readonly string[],
  shuffle: (values: readonly string[]) => string[] = secureShuffle,
): SeatAssignment[] {
  if (seatingStatus === "CONFIRMED") {
    throw new Error("Подтверждённую рассадку нельзя перерандомить");
  }
  if (playerIds.length !== PLAYER_COUNT || new Set(playerIds).size !== PLAYER_COUNT) {
    throw new Error("Для рассадки нужны 10 уникальных игроков турнира");
  }
  return shuffle(playerIds).map((playerId, index) => ({ playerId, seatNumber: index + 1 }));
}

export function assertSeatingCanBeConfirmed(
  seatingStatus: "PENDING" | "GENERATED" | "CONFIRMED",
  seats: readonly SeatAssignment[],
) {
  if (seatingStatus !== "GENERATED") {
    throw new Error("Сначала сгенерируйте рассадку");
  }
  const players = new Set(seats.map((seat) => seat.playerId));
  const places = new Set(seats.map((seat) => seat.seatNumber));
  if (
    seats.length !== PLAYER_COUNT ||
    players.size !== PLAYER_COUNT ||
    places.size !== PLAYER_COUNT ||
    [...places].some((place) => place < 1 || place > PLAYER_COUNT)
  ) {
    throw new Error("Рассадка должна содержать 10 уникальных игроков на местах 1–10");
  }
}
