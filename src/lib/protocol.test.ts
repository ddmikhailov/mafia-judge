import { describe, expect, it } from "vitest";
import { validateProtocolRecord } from "./protocol";

describe("протокол игрока", () => {
  const seats = Array.from({ length: 10 }, (_, index) => index + 1);

  it("сохраняет быстрые отметки и дополнительную информацию", () => {
    expect(validateProtocolRecord({ marks: [{ seatNumber: 2, mark: "BLACK" }, { seatNumber: 7, mark: "SHERIFF" }], note: "  Дополнение  " }, seats)).toEqual({
      marks: [{ seatNumber: 2, mark: "BLACK" }, { seatNumber: 7, mark: "SHERIFF" }],
      note: "Дополнение",
    });
  });

  it("отклоняет повторяющееся место", () => {
    expect(() => validateProtocolRecord({ marks: [{ seatNumber: 2, mark: "RED" }, { seatNumber: 2, mark: "DON" }] }, seats)).toThrow("повторяющееся");
  });
});
