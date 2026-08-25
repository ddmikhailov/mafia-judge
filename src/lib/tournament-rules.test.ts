import { describe, expect, it } from "vitest";
import {
  assertSeatingCanBeConfirmed,
  buildRegeneratedSeating,
  prepareTournament,
} from "./tournament-rules";

const tenPlayers = Array.from({ length: 10 }, (_, index) => `Игрок ${index + 1}`);
const tenIds = Array.from({ length: 10 }, (_, index) => `player-${index + 1}`);

describe("создание миникапа", () => {
  it("отклоняет состав не из 10 игроков", () => {
    expect(() => prepareTournament({ name: "Кубок", nicknames: tenPlayers.slice(0, 9) })).toThrow();
  });

  it("отклоняет дубли ников после trim и case-normalization", () => {
    const nicknames = [...tenPlayers];
    nicknames[9] = "  ИГРОК 1 ";
    expect(() => prepareTournament({ name: "Кубок", nicknames })).toThrow(/уникальными/);
  });

  it("создаёт данные ровно для пяти туров", () => {
    expect(prepareTournament({ name: "Кубок", nicknames: tenPlayers }).rounds).toEqual([
      { number: 1 }, { number: 2 }, { number: 3 }, { number: 4 }, { number: 5 },
    ]);
  });
});

describe("рассадка", () => {
  it("содержит каждого из 10 игроков один раз на местах 1–10", () => {
    const seats = buildRegeneratedSeating("PENDING", tenIds, (values) => [...values].reverse());
    expect(new Set(seats.map((seat) => seat.playerId))).toEqual(new Set(tenIds));
    expect(seats.map((seat) => seat.seatNumber)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it("не меняет подтверждённую рассадку обычной регенерацией", () => {
    const persisted = buildRegeneratedSeating("PENDING", tenIds, (values) => [...values]);
    assertSeatingCanBeConfirmed("GENERATED", persisted);
    expect(() => buildRegeneratedSeating("CONFIRMED", tenIds)).toThrow(/нельзя перерандомить/);
    expect(persisted.map((seat) => seat.playerId)).toEqual(tenIds);
  });
});
