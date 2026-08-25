# Production deployment

Целевая схема: один Linux VPS, Docker Compose, Next.js `app`, PostgreSQL `db` и Caddy с автоматическим HTTPS. PostgreSQL не публикует порт наружу.

## Требования

- Linux VPS с DNS A/AAAA-записью домена;
- Docker Engine и Docker Compose plugin;
- открытые входящие порты `22`, `80`, `443`; порт `5432` закрыт;
- минимум 2 GB RAM и достаточно места по `df -h`.

Все команды выполнять из корня репозитория. После создания `.env.production` задать сокращение и домен для текущей shell-сессии:

```bash
export COMPOSE="docker compose --env-file .env.production -f docker-compose.prod.yml"
export DOMAIN="$(sed -n 's/^DOMAIN=//p' .env.production)"
```

## Первичное развёртывание

```bash
git clone <REPOSITORY_URL> /opt/mafia-codex-judge
cd /opt/mafia-codex-judge
git log -1 --oneline   # сверить с опубликованным production commit

cp .env.example .env.production
nano .env.production
chmod 600 .env.production
mkdir -p backups
chmod 700 backups
export COMPOSE="docker compose --env-file .env.production -f docker-compose.prod.yml"
export DOMAIN="$(sed -n 's/^DOMAIN=//p' .env.production)"
```

В `.env.production` заменить все placeholders. `POSTGRES_PASSWORD` должен быть длинным случайным значением; в `DATABASE_URL` пароль должен быть URL-encoded. `DOMAIN` указывается без `https://`, а `NEXT_PUBLIC_APP_URL` — с `https://`.

Environment boundary:

- build-time: `NEXT_PUBLIC_APP_URL` встраивается при сборке `app`;
- app runtime: `DATABASE_URL`, `NEXT_PUBLIC_APP_URL`, `TZ`;
- PostgreSQL initialization: `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`;
- Caddy runtime: `DOMAIN`.

После первого создания volume простое изменение `POSTGRES_PASSWORD` в файле не меняет пароль существующей роли PostgreSQL; ротацию выполнять отдельно и синхронно обновлять `DATABASE_URL`.

```bash
$COMPOSE build
$COMPOSE up -d db
$COMPOSE run --rm migrate
$COMPOSE up -d --no-deps app
$COMPOSE up -d caddy
$COMPOSE ps
curl --fail --silent --show-error https://$DOMAIN/api/health
```

Ожидается `{"status":"ok","database":"ok"}`. Caddy выпустит и будет обновлять TLS-сертификат автоматически. DNS должен уже указывать на VPS.

## Повторный deploy

Обновление всегда начинается с backup. Текущий контейнер приложения продолжает работать, пока build/migration не завершены.

```bash
cd /opt/mafia-codex-judge
./scripts/backup-db.sh
docker image inspect mafia-codex-judge-app:latest >/dev/null 2>&1 && \
  docker image tag mafia-codex-judge-app:latest mafia-codex-judge-app:rollback || true
git pull --ff-only
$COMPOSE build
$COMPOSE run --rm migrate
$COMPOSE up -d --no-deps app
$COMPOSE up -d caddy
curl --fail --silent --show-error https://$DOMAIN/api/health
```

Если `migrate` завершился с ошибкой: не запускать `db push`, `migrate dev` или reset; сохранить старый app-контейнер, изучить `$COMPOSE logs migrate` и устранить причину. Миграция считается неприменённой до успешного `migrate deploy`.

## Перезапуск и диагностика

```bash
$COMPOSE ps
$COMPOSE logs --tail=200 app
$COMPOSE logs --tail=200 db
$COMPOSE restart app
curl --fail https://$DOMAIN/api/health
```

Обычный restart/deploy не удаляет named volume PostgreSQL. Не выполнять `docker compose down -v` и не удалять volume вручную.

Если приложение не отвечает, но DB healthy — перезапустить только `app`. Если DB unhealthy — остановить игровые действия, проверить диск и логи; не запускать reset/migrations вслепую.

## Rollback приложения

Rollback кода не откатывает миграции БД автоматически.

```bash
./scripts/backup-db.sh
docker image inspect mafia-codex-judge-app:rollback
docker image tag mafia-codex-judge-app:rollback mafia-codex-judge-app:latest
$COMPOSE up -d --no-deps app
curl --fail https://$DOMAIN/api/health
```

Это возвращает предыдущий app image без изменения PostgreSQL. Для более старого Git-релиза: перейти на предыдущий проверенный deployment commit и заново выполнить `build app`; commit должен содержать совместимые deployment-файлы. Если старый код несовместим с уже применённой migration, остановиться и восстановить согласованную пару code/database только по отдельному плану. SQL downgrade автоматически не выполняется.

## Backup

Ручной backup до и сразу после турнира:

```bash
./scripts/backup-db.sh
```

Файлы создаются на VPS в `./backups/mafia_YYYY-MM-DD_HH-MM-SS.dump`, имеют custom format, проверяются через `pg_restore --list`; retention — 14 дней, сегодняшний файл cleanup не удаляет.

Ежедневный cron в `03:00` по локальному времени сервера:

```cron
0 3 * * * cd /opt/mafia-codex-judge && ENV_FILE=.env.production ./scripts/backup-db.sh >> /var/log/mafia-backup.log 2>&1; status=$?; echo "$(date -Iseconds) backup_exit=$status" >> /var/log/mafia-backup.log; exit $status
```

Проверка cron и последнего backup:

```bash
tail -n 50 /var/log/mafia-backup.log
find backups -maxdepth 1 -name 'mafia_*.dump' -printf '%TY-%Tm-%Td %TH:%TM %s %p\n' | sort
pgrep -a cron || systemctl status cron
```

Последняя строка успешного запуска должна содержать `backup_exit=0`; перед турниром также проверить ненулевой размер последнего dump.

Скачать свежий dump на локальный компьютер:

```bash
scp user@your-vps:/opt/mafia-codex-judge/backups/mafia_YYYY-MM-DD_HH-MM-SS.dump .
```

Backup-каталог не монтируется в Caddy/app и не раздаётся по HTTP.

## Restore test

Безопасный default восстанавливает только в отдельную БД `mafia_restore_test`:

```bash
./scripts/restore-db.sh backups/mafia_YYYY-MM-DD_HH-MM.dump
$COMPOSE run --rm migrate sh -ec 'export DATABASE_URL="${DATABASE_URL%/*}/mafia_restore_test?schema=public"; npx prisma migrate status'
$COMPOSE exec -T db psql -U "$POSTGRES_USER" -d mafia_restore_test -c 'SELECT name FROM "Tournament" ORDER BY "createdAt" DESC LIMIT 5;'
$COMPOSE exec -T db dropdb --force -U "$POSTGRES_USER" mafia_restore_test
```

Если переменные не экспортированы в shell, для двух последних команд вместо `$POSTGRES_USER` подставить значение из `.env.production`.

Dangerous production restore выполняется только после подтверждённого решения и автоматически сначала создаёт backup текущего состояния:

```bash
./scripts/restore-db.sh backups/mafia_YYYY-MM-DD_HH-MM.dump --production --confirm RESTORE_PRODUCTION
curl --fail https://$DOMAIN/api/health
```

## Данные и место на диске

- PostgreSQL: named volume `mafia-codex-judge_postgres_data` (`docker volume inspect mafia-codex-judge_postgres_data`).
- Backup: `/opt/mafia-codex-judge/backups` на host filesystem.

Перед турниром:

```bash
df -h
docker system df
du -sh backups
```

Не выполнять автоматическую очистку Docker volumes.

## Production smoke

После deploy:

1. `GET https://$DOMAIN/api/health` возвращает 200.
2. Manifest и icons открываются по HTTPS: `/manifest.webmanifest`, `/icons/icon.svg`.
3. С телефона создать `PRE-TOURNAMENT TEST` с 10 игроками.
4. Сгенерировать и подтвердить рассадку, сделать reload и проверить сохранность.
5. Выполнить [PRE_TOURNAMENT_ACCEPTANCE.md](PRE_TOURNAMENT_ACCEPTANCE.md).
6. Сделать backup и restore test по разделу выше.
7. Удалить тестовые данные только штатным способом, если он доступен; иначе не удалять завершённую историю SQL-командами непосредственно перед турниром.

## Security minimum

- `.env.production` имеет права `600` и не коммитится;
- PostgreSQL находится только во внутренней Docker network;
- наружу опубликованы только Caddy `80/443`;
- containers не privileged, app работает от непривилегированного пользователя;
- health response не содержит credentials;
- backup directory имеет права `700` и не доступен reverse proxy.
