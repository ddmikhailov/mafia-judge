import { ZodError } from "zod";

export class DomainError extends Error {
  constructor(message: string, public readonly code = "DOMAIN_ERROR", public readonly status = 400) {
    super(message);
    this.name = "DomainError";
  }
}

export function publicError(error: unknown, fallback = "Не удалось сохранить действие. Повторите попытку.") {
  if (error instanceof DomainError) return { message: error.message, status: error.status, code: error.code };
  if (error instanceof ZodError) return { message: error.issues[0]?.message ?? "Проверьте введённые данные", status: 400, code: "VALIDATION_ERROR" };
  const errorId = crypto.randomUUID();
  console.error(`[${new Date().toISOString()}] unexpected error ${errorId}`, error);
  return { message: `${fallback} Код ошибки: ${errorId}`, status: 500, code: "UNEXPECTED_ERROR" };
}

export const accessDenied = () => new DomainError("Объект не найден или недоступен", "NOT_FOUND", 404);
