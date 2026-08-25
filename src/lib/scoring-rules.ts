import type { Team, Winner } from "./game-rules";

const SCALE = 1000;
const WINNER_DB = [0, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.2, 1.6] as const;
const LOSER_DB = [0, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8] as const;

export type ScoreValue = string | number | { toString(): string };

export function scoreUnits(value: ScoreValue): number {
  const parsed = Number(value.toString());
  if (!Number.isFinite(parsed)) throw new Error("Некорректное значение балла");
  return Math.round(parsed * SCALE);
}

export function scoreStringFromUnits(units: number): string {
  if (!Number.isInteger(units)) throw new Error("Баллы должны иметь точность до 0.001");
  return (units / SCALE).toFixed(3).replace(/\.000$/, ".0").replace(/(\.\d*[1-9])0+$/, "$1");
}

export function addScores(...values: ScoreValue[]): string {
  return scoreStringFromUnits(values.reduce<number>((sum, value) => sum + scoreUnits(value), 0));
}

export function basePoints(winner: Winner, team: Team): string {
  return winner !== "DRAW" && winner === team ? "1.0" : "0.0";
}

export function allowedJudgeAdditional(winner: Winner, team: Team): readonly number[] {
  if (winner === "DRAW") return [0];
  return winner === team ? WINNER_DB : LOSER_DB;
}

export type JudgeScoreInput = {
  team: Team;
  judgeAdditionalPoints: ScoreValue;
  blackTriplePoints: ScoreValue;
};

export function validateJudgeAdditional(
  winner: Winner,
  scores: readonly JudgeScoreInput[],
  headJudgeApproved: boolean,
) {
  for (const score of scores) {
    const value = scoreUnits(score.judgeAdditionalPoints);
    const allowed = allowedJudgeAdditional(winner, score.team).map(scoreUnits);
    if (!allowed.includes(value)) {
      throw new Error(winner === "DRAW" ? "При ничьей положительные ДБ запрещены" : "Для команды выбрано недопустимое значение ДБ");
    }
    if (scoreUnits(score.blackTriplePoints) > 0 && value + scoreUnits(score.blackTriplePoints) > 1200) {
      throw new Error("Сумма ДБ и ТЧ игрока не может превышать 1.2");
    }
    if (value === 1600 && !headJudgeApproved) {
      throw new Error("ДБ +1.6 требует согласования с Главным судьёй");
    }
  }

  const positive = scores.filter((score) => scoreUnits(score.judgeAdditionalPoints) > 0).length;
  if (positive > 8) throw new Error("ДБ можно выдать не более чем 8 игрокам");
  if (positive >= 7 && !headJudgeApproved) throw new Error("ДБ для 7–8 игроков требует согласования с Главным судьёй");

  const total = scores.reduce((sum, score) => sum + scoreUnits(score.judgeAdditionalPoints), 0);
  if (total > 4000) throw new Error("Общая сумма ДБ не может превышать 4.0");
  if (total > 3500 && !headJudgeApproved) throw new Error("Сумма ДБ свыше 3.5 требует согласования с Главным судьёй");
}

export function sumPenaltyPoints(values: readonly ScoreValue[]): string {
  return addScores(...values);
}

export function totalWithoutCompensation(input: {
  basePoints: ScoreValue;
  judgeAdditionalPoints: ScoreValue;
  blackTriplePoints: ScoreValue;
  penaltyPoints: ScoreValue;
}) {
  return addScores(input.basePoints, input.judgeAdditionalPoints, input.blackTriplePoints, input.penaltyPoints);
}
