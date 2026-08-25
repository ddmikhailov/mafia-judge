# Tournament runbook

Короткая эксплуатационная памятка для реального миникапа.

## До турнира

```bash
cd /opt/mafia-codex-judge
export COMPOSE="docker compose --env-file .env.production -f docker-compose.prod.yml"
export DOMAIN="$(sed -n 's/^DOMAIN=//p' .env.production)"
$COMPOSE ps
curl --fail https://$DOMAIN/api/health
df -h
./scripts/backup-db.sh
```

- открыть приложение с судейского телефона;
- проверить HTTPS, manifest/PWA и reload;
- выполнить `PRE_TOURNAMENT_ACCEPTANCE.md`;
- удалить `PRE-TOURNAMENT TEST` штатным способом, если он доступен;
- создать реальный миникап и перепроверить 10 ников;
- не обновлять приложение или зависимости перед стартом.

## Если UI завис

1. Не нажимать одно действие много раз.
2. Сделать один reload страницы.
3. Проверить `https://$DOMAIN/api/health`.
4. Продолжить с сохранённого сервером состояния.

## Если приложение недоступно

```bash
$COMPOSE ps
$COMPOSE logs --tail=100 app
$COMPOSE restart app
curl --fail https://$DOMAIN/api/health
```

Не трогать PostgreSQL volume и не выполнять `down -v`.

## Если PostgreSQL недоступен

1. Остановить игровые действия.
2. Не запускать reset, `db push` или migration.
3. Проверить `$COMPOSE logs --tail=200 db` и `df -h`.
4. Попробовать `$COMPOSE restart db`, затем health check.
5. Restore выполнять только по `DEPLOYMENT.md` и только из проверенного dump.

## После турнира

1. Экспортировать Excel и открыть оба листа.
2. Выполнить `./scripts/backup-db.sh`.
3. Скачать свежий `.dump` с VPS на отдельный компьютер через `scp`.
4. Проверить размер файла и `pg_restore --list`.
5. Только после этого обновлять приложение.
