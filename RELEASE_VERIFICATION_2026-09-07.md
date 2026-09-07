# Release verification — 7 сентября 2026

Release candidate: `v0.2.0`, based on `ff26a5a`.

## Local PostgreSQL verification

- PostgreSQL 17 ran in an isolated Docker container bound only to `127.0.0.1:55438`.
- All five committed Prisma migrations applied successfully.
- `npm test -- --no-file-parallelism`: 9 test files, 102/102 tests passed.
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
- changing a saved role keeps the selected value immediately and after reload;
- first-night transitions and start of day 1;
- each new phase, subphase and speaker receives a fresh stopped timer with the correct duration, including the 20-second black-triple phase;
- two consecutive foul submissions increment the same player from 0 to 2; foul persists after reload and Undo restores the count;
- manual winner declaration requires an explicit warning confirmation, records the actor and moves directly to scoring;
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
- The final Amvera image started against the isolated PostgreSQL database, applied no pending migrations and returned `{"status":"ok","database":"ok"}`.
- Docker dependency installation uses a persistent npm cache, bounded concurrency and retry timeouts to tolerate transient registry pauses during an Amvera build.
- No schema changes or new migrations are included in this release.

## Production preflight

- Scheduled database backups are enabled in Amvera.
- Backup `ddmikhailov-cnpg-backup-mafia-judge-db-20260907150000` is ready.
- The application has only the required runtime settings: `DATABASE_URL`, `NEXT_PUBLIC_APP_URL` and `TZ`; no bootstrap or recovery variables remain.
- The pre-deployment production health check returned HTTP 200 with database status `ok`.

## Dependency audit

- Updated `fflate` to `0.8.3`, removing the malformed ZIP64 denial-of-service advisory from the Excel dependency tree.
- Overrode Prisma's unused MySQL transport dependency to `mysql2 3.24.3`, removing its credential-downgrade and decompression advisories.
- `npm audit --omit=dev` now reports one underlying advisory, represented as three high-severity dependency nodes: `deepmerge-ts <8` through the Prisma CLI configuration loader. It is used only while processing the repository-owned `prisma.config.ts`; no user input reaches it. The available automated fix downgrades Prisma across a major-version boundary, so it was not applied to this release.

## Release decision

Local release validation: **GO**.

Production completion still requires a successful Amvera rebuild/startup, post-deployment health and security-header checks, and the owner's personal login verification without sharing the password.
