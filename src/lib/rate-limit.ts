type Entry = { count: number; resetAt: number };
import { DomainError } from "./errors";

const entries = new Map<string, Entry>();
const MAX_ENTRIES = 500;

function prune(now: number) {
  for (const [key, entry] of entries) if (entry.resetAt <= now) entries.delete(key);
  while (entries.size >= MAX_ENTRIES) entries.delete(entries.keys().next().value!);
}

export function consumeRateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  prune(now);
  const current = entries.get(key);
  if (!current || current.resetAt <= now) {
    entries.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  if (current.count >= limit) throw new DomainError("Слишком много попыток. Повторите позже.", "RATE_LIMITED", 429);
  current.count += 1;
}

export function resetRateLimit(key: string) {
  entries.delete(key);
}
