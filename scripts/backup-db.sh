#!/usr/bin/env sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$ROOT_DIR"

ENV_FILE=${ENV_FILE:-.env.production}
COMPOSE_FILE=${COMPOSE_FILE:-docker-compose.prod.yml}
BACKUP_DIR=${BACKUP_DIR:-./backups}
RETENTION_DAYS=${RETENTION_DAYS:-14}

if ! command -v docker >/dev/null 2>&1; then
  echo "ERROR: docker is required" >&2
  exit 1
fi
if [ ! -f "$ENV_FILE" ]; then
  echo "ERROR: environment file not found: $ENV_FILE" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
umask 077

timestamp=$(date '+%Y-%m-%d_%H-%M-%S')
backup_file="$BACKUP_DIR/mafia_${timestamp}.dump"
partial_file="${backup_file}.partial"
trap 'rm -f "$partial_file"' EXIT HUP INT TERM

compose() {
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
}

echo "[$(date -Iseconds)] Creating PostgreSQL backup: $backup_file"
compose exec -T db sh -ec 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$partial_file"

if [ ! -s "$partial_file" ]; then
  echo "ERROR: backup is empty" >&2
  exit 1
fi

compose exec -T db pg_restore --list < "$partial_file" >/dev/null
mv "$partial_file" "$backup_file"
trap - EXIT HUP INT TERM

# GNU find on the Linux VPS: keep today and the latest 14 calendar days.
find "$BACKUP_DIR" -maxdepth 1 -type f -name 'mafia_*.dump' -mtime "+$((RETENTION_DAYS - 1))" ! -newermt "$(date '+%Y-%m-%d')" -delete

size=$(du -h "$backup_file" | awk '{print $1}')
echo "[$(date -Iseconds)] Backup verified: $backup_file ($size)"
printf '%s\n' "$backup_file"
