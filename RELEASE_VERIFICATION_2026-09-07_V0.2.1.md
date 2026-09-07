# Release verification — v0.2.1

Release purpose: securely provision the owner's `SUPER_ADMIN` account without transmitting or storing a temporary plaintext password.

## Local verification

- PostgreSQL 17 ran in the isolated `mafia_ui` database on `127.0.0.1:55438`.
- All six committed Prisma migrations applied successfully; migration status is up to date.
- `npm test -- --no-file-parallelism`: 10 test files, 107/107 tests passed.
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm run build`: passed.
- `npx prisma validate`: passed.
- The standard Next.js `runner` Docker image built and started successfully.
- Container health returned HTTP 200 with `{"status":"ok","database":"ok"}`.

## Password-reset security properties

- A new owner account is created only by explicitly enabled startup provisioning.
- An existing login must already belong to an active `SUPER_ADMIN`; another role is never upgraded implicitly.
- The new account receives a random, unknown initial password hash.
- The reset token has 256 bits of randomness, is stored only as a SHA-256 hash and expires after two hours.
- The token is delivered in the URL fragment after `#`, which is not included in the initial HTTP request or standard access log.
- The link is single-use; concurrent or repeated use is rejected.
- A successful reset revokes all active sessions for the account.
- Passwords are limited to 12–200 characters and at most 72 UTF-8 bytes, matching bcrypt's safe input boundary.
- Provisioning logs contain no login, token, password, hash or database connection details.

## Production steps

1. Deploy the migration and application version 0.2.1.
2. Add the three provisioning variables and one secret described in `AMVERA_DEPLOYMENT.md`.
3. Restart once and verify the provisioning success message.
4. Remove all four temporary settings immediately and restart again.
5. Verify migrations, startup, health and the reset page.
6. The owner personally chooses and submits the new password.
