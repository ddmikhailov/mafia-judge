import { describe, expect, it } from "vitest";
import {
  blackTriplePoints,
  calculateVoteOutcome,
  determineWinner,
  donCheck,
  foulOutcome,
  isCommonDraw,
  repeatedTieTransition,
  sheriffCheck,
  validateNomination,
  validateRoleComposition,
  type Role,
  type RuleSeat,
} from "./game-rules";
import {
  confirmResultTransition,
  endDayTransition,
  firstNightTransition,
  startNextDay,
} from "./game-state";

function seats(roles: Role[], eliminated: number[] = []): RuleSeat[] {
  return roles.map((role, index) => ({ seatNumber: index + 1, role, status: eliminated.includes(index + 1) ? "ELIMINATED" : "ACTIVE" }));
}

const validRoles: Role[] = ["DON", "MAFIA", "MAFIA", "SHERIFF", "CIVILIAN", "CIVILIAN", "CIVILIAN", "CIVILIAN", "CIVILIAN", "CIVILIAN"];

describe("роли и победитель", () => {
  it("валидирует состав 6/1/2/1", () => expect(validateRoleComposition(validRoles)).toBe(true));
  it("определяет победу красных", () => expect(determineWinner(seats(validRoles, [1, 2, 3]))).toBe("RED"));
  it("определяет победу чёрных", () => expect(determineWinner(seats(validRoles, [4, 5, 6, 7, 8]))).toBe("BLACK"));
  it("не предлагает победителя раньше времени", () => expect(determineWinner(seats(validRoles))).toBeNull());
});

describe("день и фолы", () => {
  it("первый день начинает место 1", () => expect(firstNightTransition("FREE_SEATING").currentSpeakerSeat).toBe(1));
  it("следующий день начинает следующее активное место", () => expect(startNextDay([1, 3, 4, 8], 1, 1).firstSpeakerSeat).toBe(3));
  it("третий фол создаёт ограничение речи", () => expect(foulOutcome(2, 10)).toMatchObject({ foulCount: 3, speechRestrictionSeconds: 10, eliminated: false }));
  it("четвёртый фол выводит игрока", () => expect(foulOutcome(3, 10).eliminated).toBe(true));
  it("отклоняет повторную кандидатуру", () => expect(() => validateNomination([{ nominatorSeat: 1, nomineeSeat: 5 }], 2, 5)).toThrow(/уже выставлен/));
  it("на первом дне с одной кандидатурой пропускает голосование", () => expect(endDayTransition(1, 1)).toEqual({ phase: "NIGHT", subphase: "SHOOTING" }));
});

describe("голосование и автокатастрофа", () => {
  it("определяет единственного победителя голосования", () => expect(calculateVoteOutcome([2, 5], [6, null], 10)).toMatchObject({ kind: "WINNER", seatNumber: 2 }));
  it("равный максимум создаёт tie", () => expect(calculateVoteOutcome([2, 5], [5, 5], 10)).toMatchObject({ kind: "TIE", seats: [2, 5] }));
  it("уменьшенный tie создаёт новую автокатастрофу", () => expect(repeatedTieTransition([2, 5, 8], [2, 5], 8)).toBe("NEXT_CAR_CRASH"));
  it("повтор того же tie ведёт к group exit", () => expect(repeatedTieTransition([2, 5], [2, 5], 8)).toBe("GROUP_EXIT"));
});

describe("ночь, ТЧ и завершение", () => {
  it("вычисляет проверку Дона", () => expect(donCheck("SHERIFF")).toBe("IS_SHERIFF"));
  it("вычисляет проверку Шерифа", () => expect(sheriffCheck("MAFIA")).toBe("BLACK"));
  it("считает ТЧ мирного с 3 чёрными", () => expect(blackTriplePoints("CIVILIAN", 3)).toBe(0.8));
  it("считает ТЧ мирного с 2 чёрными", () => expect(blackTriplePoints("CIVILIAN", 2)).toBe(0.55));
  it("считает ТЧ Шерифа с 3 чёрными", () => expect(blackTriplePoints("SHERIFF", 3)).toBe(0.7));
  it("считает ТЧ Шерифа с 2 чёрными", () => expect(blackTriplePoints("SHERIFF", 2)).toBe(0.45));
  it("предлагает common draw после пяти тихих фаз", () => expect(isCommonDraw(5)).toBe(true));
  it("подтверждённый результат переводит игру в SCORING", () => expect(confirmResultTransition("RED")).toMatchObject({ winner: "RED", status: "SCORING", phase: "SCORING" }));
});
