#!/usr/bin/env sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$ROOT_DIR"

ENV_FILE=${ENV_FILE:-.env.production}
COMPOSE_FILE=${COMPOSE_FILE:-docker-compose.prod.yml}
TARGET_DB=mafia_restore_test
PRODUCTION_MODE=0
CONFIRMATION=
BACKUP_FILE=

usage() {
  cat <<'EOF'
Safe default (restores only into a separate *_restore_test database):
  scripts/restore-db.sh backups/mafia_YYYY-MM-DD_HH-MM.dump
  scripts/restore-db.sh backups/file.dump --target another_restore_test

Dangerous production restore (backs up current production DB first):
  scripts/restore-db.sh backups/file.dump --production --confirm RESTORE_PRODUCTION
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --target)
      [ "$#" -ge 2 ] || { usage >&2; exit 2; }
      TARGET_DB=$2
      shift 2
      ;;
    --production)
      PRODUCTION_MODE=1
      shift
      ;;
    --confirm)
      [ "$#" -ge 2 ] || { usage >&2; exit 2; }
      CONFIRMATION=$2
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      if [ -n "$BACKUP_FILE" ]; then
        usage >&2
        exit 2
      fi
      BACKUP_FILE=$1
      shift
      ;;
  esac
done

[ -n "$BACKUP_FILE" ] || { usage >&2; exit 2; }
[ -s "$BACKUP_FILE" ] || { echo "ERROR: backup does not exist or is empty: $BACKUP_FILE" >&2; exit 1; }
[ -f "$ENV_FILE" ] || { echo "ERROR: environment file not found: $ENV_FILE" >&2; exit 1; }
command -v docker >/dev/null 2>&1 || { echo "ERROR: docker is required" >&2; exit 1; }

compose() {
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
}

compose exec -T db pg_restore --list < "$BACKUP_FILE" >/dev/null
production_db=$(compose exec -T db sh -ec 'printf %s "$POSTGRES_DB"')
production_user=$(compose exec -T db sh -ec 'printf %s "$POSTGRES_USER"')

if [ "$PRODUCTION_MODE" -eq 1 ]; then
  [ "$CONFIRMATION" = "RESTORE_PRODUCTION" ] || {
    echo "ERROR: production restore requires --confirm RESTORE_PRODUCTION" >&2
    exit 1
  }
  TARGET_DB=$production_db
  echo "DANGER: production database '$TARGET_DB' will be replaced."
  ENV_FILE="$ENV_FILE" COMPOSE_FILE="$COMPOSE_FILE" "$ROOT_DIR/scripts/backup-db.sh" >/dev/null
  compose stop app
else
  case "$TARGET_DB" in
    *_restore_test) ;;
    *)
      echo "ERROR: safe restore target must end with _restore_test" >&2
      exit 1
      ;;
  esac
  if [ "$TARGET_DB" = "$production_db" ]; then
    echo "ERROR: refusing to overwrite production database without --production" >&2
    exit 1
  fi
fi

case "$TARGET_DB" in
  *[!A-Za-z0-9_]*) echo "ERROR: invalid database name" >&2; exit 1 ;;
esac

echo "[$(date -Iseconds)] Restoring into database: $TARGET_DB"
compose exec -T db dropdb --if-exists --force -U "$production_user" "$TARGET_DB"
compose exec -T db createdb -U "$production_user" "$TARGET_DB"
compose exec -T db pg_restore -U "$production_user" -d "$TARGET_DB" --no-owner --no-privileges < "$BACKUP_FILE"

compose exec -T db psql -U "$production_user" -d "$TARGET_DB" -v ON_ERROR_STOP=1 -Atc \
  'SELECT count(*) FROM "_prisma_migrations"; SELECT count(*) FROM "Tournament";'

echo "[$(date -Iseconds)] Restore verified: $TARGET_DB"
if [ "$PRODUCTION_MODE" -eq 1 ]; then
  compose up -d app caddy
  echo "Production containers restarted. Check /api/health immediately."
else
  echo "Test database preserved for inspection. Remove it with:"
  echo "docker compose --env-file $ENV_FILE -f $COMPOSE_FILE exec -T db dropdb --force -U $production_user $TARGET_DB"
fi
