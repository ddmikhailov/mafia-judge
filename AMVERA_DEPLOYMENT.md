# Amvera production deployment

Production topology:

```text
Amvera HTTPS domain -> Next.js Docker application -> managed PostgreSQL (internal network)
```

Amvera does not run `docker-compose.prod.yml`; that file remains the VPS deployment option. The Amvera project uses `Dockerfile` target `amvera-runner` and `amvera.yaml`.

## Current production

- application project: `mafia-judge`;
- managed PostgreSQL project: `mafia-judge-db`;
- public URL: `https://mafia-judge-ddmikhailov.amvera.io`;
- health check: `https://mafia-judge-ddmikhailov.amvera.io/api/health`;
- database is reachable by the application only through Amvera's internal network;
- source is mirrored to GitHub at `https://github.com/ddmikhailov/mafia-judge` and to the Amvera project repository.

The existing `rfm-live` application is unrelated to this deployment and must remain stopped unless the owner explicitly decides otherwise.

## Projects

Create two projects in the same Amvera account:

1. managed PostgreSQL, one replica, tariff `Начальный` or higher;
2. application, tariff `Начальный Плюс` or higher for a reliable Next.js build.

For PostgreSQL use a non-reserved database and user name. Keep the password in the Amvera secret store.

## Application variables

Add in the application project:

- secret `DATABASE_URL=postgresql://<user>:<url-encoded-password>@<internal-rw-host>:5432/<database>?schema=public`;
- variable `NEXT_PUBLIC_APP_URL=https://<public-amvera-domain>`;
- variable `TZ=Europe/Moscow`.

Restart or rebuild the application after changing variables. On every container start the image executes `prisma migrate deploy`; a failed migration prevents the application from starting and never resets the database.

## Health and smoke

```bash
curl --fail https://<public-amvera-domain>/api/health
```

Expected response:

```json
{"status":"ok","database":"ok"}
```

Then create a temporary 10-player tournament, confirm a seating, reload and verify persistence.

## Backups

Enable scheduled PostgreSQL backups in Amvera and create an on-demand cluster backup immediately before and after the tournament. Amvera retains the latest three scheduled and three manual cluster backups.

In addition, expose a temporary SSL PostgreSQL domain and download a custom-format dump to a separate computer:

```bash
pg_dump "$DATABASE_URL" -Fc -f mafia_YYYY-MM-DD_HH-MM-SS.dump
pg_restore --list mafia_YYYY-MM-DD_HH-MM-SS.dump
```

Restore-test the dump into a separate database or use an Amvera backup restore, which creates a separate PostgreSQL service. Never overwrite the active production database without a fresh backup and explicit decision.
