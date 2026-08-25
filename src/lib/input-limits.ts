import { z } from "zod";

export const TOURNAMENT_NAME_MAX = 120;
export const NICKNAME_MAX = 60;
export const COMMENT_MAX = 500;
export const OVERRIDE_REASON_MAX = 500;
export const DISPLAY_NAME_MAX = 100;
export const LOGIN_MAX = 254;
export const SCORE_ABS_MAX = 100;

export const boundedReason = z.string().trim().min(1, "Укажите причину").max(OVERRIDE_REASON_MAX, `Причина не может быть длиннее ${OVERRIDE_REASON_MAX} символов`);
export const boundedComment = z.string().trim().max(COMMENT_MAX, `Комментарий не может быть длиннее ${COMMENT_MAX} символов`);

export function normalizeLogin(value: string) {
  return value.trim().toLocaleLowerCase("ru-RU");
}

export function parseFiniteDecimal(value: string | number, options: { maxAbs?: number; nonPositive?: boolean } = {}) {
  const text = String(value).trim();
  if (!/^-?(?:\d+|\d+\.\d+|\.\d+)$/.test(text)) throw new Error("Введите корректное числовое значение");
  const parsed = Number(text);
  const maxAbs = options.maxAbs ?? SCORE_ABS_MAX;
  if (!Number.isFinite(parsed) || Math.abs(parsed) > maxAbs) throw new Error("Числовое значение выходит за технически допустимый диапазон");
  if (options.nonPositive && parsed > 0) throw new Error("Штраф не может быть положительным");
  return text;
}
