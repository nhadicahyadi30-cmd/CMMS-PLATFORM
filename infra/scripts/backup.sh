#!/usr/bin/env bash
# Cadangan harian Postgres. Contoh cron: 0 2 * * * /opt/maintainhub/infra/scripts/backup.sh
set -euo pipefail
DIR=${BACKUP_DIR:-/var/backups/maintainhub}; KEEP=${KEEP_DAYS:-14}
mkdir -p "$DIR"
docker compose exec -T db pg_dump -U "$POSTGRES_USER" -Fc "$POSTGRES_DB" > "$DIR/mh_$(date +%F).dump"
find "$DIR" -name 'mh_*.dump' -mtime +"$KEEP" -delete
# Uji pemulihan berkala: pg_restore --list "$DIR/mh_<tanggal>.dump"
