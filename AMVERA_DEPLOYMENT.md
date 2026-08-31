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

## Первый SUPER_ADMIN

После применения security migration один раз выполнить внутри application container:

```bash
ADMIN_LOGIN=admin \
ADMIN_DISPLAY_NAME='Главный администратор' \
ADMIN_PASSWORD='<unique-strong-password>' \
npm run admin:create
```

Значения передавать только на время команды. `ADMIN_PASSWORD` не добавлять в постоянные переменные Amvera, Git или логи. Команда отказывает при повторном логине, хранит только bcrypt-хеш и не печатает пароль. После входа SUPER_ADMIN создаёт HEAD_JUDGE/JUDGE в `/admin/users` и назначает их на турниры.

Если Amvera UI не предоставляет terminal/exec, используйте одноразовый bootstrap при старте (PostgreSQL не нужно открывать наружу):

1. Создать временные настройки `BOOTSTRAP_ADMIN=1`, `ADMIN_LOGIN`, `ADMIN_DISPLAY_NAME` и секрет `ADMIN_PASSWORD` (случайный пароль 12–72 ASCII-символа).
2. Перезапустить приложение с текущим production image. После migrations выполняется bootstrap под транзакционной блокировкой. Он создаёт SUPER_ADMIN только при полностью пустой таблице пользователей. Повторный запуск ничего не меняет и не сбрасывает пароль.
3. Проверить сообщение `Initial SUPER_ADMIN created` в application log и выполнить вход.
4. Удалить все четыре временные настройки, перезапустить приложение и проверить `/api/health` и повторный вход.

Без `BOOTSTRAP_ADMIN=1` скрипт не подключается к БД. Пароли/хеши не попадают в логи или Git. Не оставлять bootstrap-секреты в настройках после завершения.

## Проверка security на отдельной локальной БД

Никогда не запускать integration fixtures против production: тесты создают и удаляют собственные турниры и пользователей. `SECURITY_INTEGRATION=1` разрешён тестовым набором только для localhost/127.0.0.1.

```bash
DATABASE_URL='<local-test-postgresql-url>' npx prisma migrate deploy
DATABASE_URL='<local-test-postgresql-url>' SECURITY_INTEGRATION=1 npm test -- --no-file-parallelism
```

Проверяются реальные DB-сессии, login/logout/rotation, inactive user, права на назначенный турнир и Excel, запрет поддельных override/approval, двойной foul/penalty, конкурентные команды, audit/undo/archive и переход к SCORING. Подменяются только Next request cookies/redirect/cache, а не Prisma/services. Файлы запускаются последовательно для совместимости с локальным Prisma Dev; отдельный тест конкурентных игровых запросов остаётся параллельным.

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
