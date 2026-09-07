# Release verification — 7 сентября 2026

Release candidate: the commit containing this verification record, based on `c58b451`.

## Local PostgreSQL verification

- PostgreSQL 17 ran in an isolated Docker container bound only to `127.0.0.1:55437`.
- All five committed Prisma migrations applied successfully.
- `npm test -- --no-file-parallelism`: 9 test files, 99/99 tests passed.
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm run build`: passed.
- `npx prisma validate`: passed.
- `npx prisma migrate status`: database schema is up to date.

The database-backed recovery check additionally verified that password recovery:

- changes only the selected active `SUPER_ADMIN` password;
- stores a bcrypt cost-12 hash;
- revokes all active sessions;
- does not expose either password in process output;
- leaves the password unchanged on an ordinary startup without recovery variables;
- keeps initial bootstrap idempotent;
- refuses a missing account without creating it.

## Local browser smoke

The production build was exercised at a `390×844` viewport against the isolated PostgreSQL database.

Verified:

- login and authenticated navigation;
- creation of exactly 10 players and 5 rounds;
- seating generation and confirmation;
- confirmed seating persists after reload;
- role assignment `1 DON + 2 MAFIA + 1 SHERIFF + 6 CIVILIAN`;
- first-night transitions and start of day 1;
- foul persists after reload and Undo restores the count;
- manual winner override requires and records a reason;
- result confirmation transitions to SCORING;
- base scores match the confirmed winning team;
- closing scoring locks the game and unlocks the next round;
- audit contains actor, reason, foul/Undo, result and scoring events;
- logout redirects direct game access to `/login`;
- anonymous Excel export redirects to `/login`;
- `/api/health` returns HTTP 200 with database status `ok`.

Five-game finalization, compensation, ranking tie-breaks and `.xlsx` contents are additionally covered by the successful PostgreSQL integration suite.

## Packaging

- Next.js production build completed successfully.
- Amvera Docker target `amvera-runner` built successfully with the production public URL.
- No schema changes or new migrations are included in this release.

## Dependency audit

- Updated `fflate` to `0.8.3`, removing the malformed ZIP64 denial-of-service advisory from the Excel dependency tree.
- Overrode Prisma's unused MySQL transport dependency to `mysql2 3.24.3`, removing its credential-downgrade and decompression advisories.
- `npm audit --omit=dev` now reports one underlying advisory, represented as three high-severity dependency nodes: `deepmerge-ts <8` through the Prisma CLI configuration loader. It is used only while processing the repository-owned `prisma.config.ts`; no user input reaches it. The available automated fix downgrades Prisma across a major-version boundary, so it was not applied to this release.

## Release decision

Local release validation: **GO**.

Production completion still requires a ready PostgreSQL backup, removal of the one-time recovery variables, successful Amvera rebuild/startup, health and security-header checks, and the owner's personal login verification without sharing the password.
