# AGENTS.md

## Mission

Ты работаешь над MVP веб-платформы судьи для миникапа Российской Федерации Мафии.

Сначала прочитай `PROJECT_SPEC.md` полностью.

Главная цель:

`10 фиксированных игроков -> 5 игр -> итоговая таблица -> Excel`.

Скорость релиза важнее архитектурной красоты, но нельзя жертвовать корректностью игровых данных и scoring rules.

---

## Source of truth

Приоритет:

1. `PROJECT_SPEC.md`
2. явно сформулированное текущее задание пользователя
3. существующий код и тесты

Регламент РФМ 2026 является исходным правилом продукта, но его цифровое отображение уже зафиксировано в `PROJECT_SPEC.md`.

Если обнаружено противоречие либо недоопределённое правило:

- не придумывай;
- не расширяй scope;
- локализуй спорное место;
- реализуй безопасный manual override либо остановись и кратко сообщи блокер.

---

## Scope discipline

Не реализовывать без прямого задания:

- auth;
- accounts;
- multi-tenant UI;
- multiple tables;
- other tournament formats;
- public pages;
- imports;
- player profiles;
- integrations;
- video;
- appeals;
- PDF;
- Telegram;
- analytics;
- microservices;
- complex offline sync.

Не делай «на будущее» большой abstraction layer.

Допускается небольшой schema-level задел, если он почти ничего не стоит и уже указан в `PROJECT_SPEC.md`.

---

## Architecture rules

- One repository.
- One Next.js application.
- TypeScript strict.
- PostgreSQL + Prisma.
- Prefer server-side business rules.
- Zod/typed validation on mutations.
- No Redux unless a concrete problem requires it.
- No event sourcing.
- Current relational state + `GameEvent` audit log.
- Scoring logic and state transition logic должны быть вынесены из React components в чистые функции/services.
- Excel exporter должен использовать готовые calculated score values, а не иметь собственную реализацию scoring formulas.
- `Math.random()` не использовать для официальной рассадки. Использовать server-side cryptographic randomness.

---

## UX rules

Primary target: mobile portrait.

- Touch targets >= ~44px.
- No hover-only actions.
- Judge should rarely type during a game.
- Common actions <= 2 taps.
- Foul = one tap + undo.
- Destructive actions require confirmation.
- Roles/check results must be privacy-safe.
- Avoid decorative UI that increases vertical space.
- Do not build a round-table visualization unless explicitly requested.

---

## Data rules

- Never physically delete completed game history.
- Overrides create audit events.
- Undo creates a compensating audit event.
- Do not silently overwrite completed scores.
- Persist important actions immediately.
- Reload must not lose confirmed seating or game data.

---

## Implementation behavior

For each task:

1. Inspect existing repository before editing.
2. Read this file and relevant parts of `PROJECT_SPEC.md`.
3. State a compact implementation plan in your work log.
4. Implement only the requested vertical slice.
5. Run formatting/lint/typecheck/tests that exist.
6. Fix failures caused by your changes.
7. Do not refactor unrelated code.
8. Do not add dependencies unless they materially reduce implementation effort.
9. Do not replace working libraries for stylistic reasons.
10. End with a concise report:
   - what changed;
   - migrations;
   - commands run;
   - test/typecheck result;
   - remaining blockers/assumptions.

---

## Testing priorities

Prefer a few high-value tests over large test volume.

Must unit-test business logic when it is introduced:

- tournament constraints;
- seating invariants;
- role composition;
- winner detection;
- voting math;
- 3rd/4th foul flow;
- TЧ scoring;
- judge additional score validation;
- compensation formulas;
- ranking tie-break.

Do not spend the MVP budget on visual snapshot tests.

---

## Migrations

Prisma migrations must be deterministic and committed.

Never reset production-like data unless explicitly instructed.

During early local development, if a destructive reset becomes necessary, state it before doing it.

---

## Manual override

Manual override is a required safety valve, not an excuse to skip the normal common path.

A rule should be automated when it is:

- common;
- deterministic;
- already specified in `PROJECT_SPEC.md`;
- inexpensive to implement.

Rare branches may use override.

Every override must preserve:

- reason;
- old value/state;
- new value/state;
- timestamp.

---

## Done means done

Do not report a step complete if the user cannot execute its Definition of Done from `PROJECT_SPEC.md`.

If you cannot complete a requirement, say exactly what is missing instead of masking it with mock data or TODO behavior.
