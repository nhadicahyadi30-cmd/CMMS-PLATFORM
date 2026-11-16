#!/usr/bin/env bash
# Backup harian Postgres di dalam container. Berkas: /backups/mh_YYYY-MM-DD_HHMM.dump (di host: ./backups).
# Juga membuat satu backup saat container pertama kali jalan, lalu satu per hari pada jam BACKUP_HOUR.
set -uo pipefail
DIR=/backups; HOUR=${BACKUP_HOUR:-2}; KEEP=${KEEP_DAYS:-14}
mkdir -p "$DIR"

do_backup() {
  local f="$DIR/mh_$(date +%F_%H%M).dump"
  if pg_dump -Fc -f "$f.tmp"; then
    mv "$f.tmp" "$f"
    # verifikasi bahwa berkas bisa dibaca pg_restore
    if pg_restore --list "$f" >/dev/null 2>&1; then echo "[backup] OK $f ($(du -h "$f" | cut -f1))"; else echo "[backup] GAGAL verifikasi $f"; mv "$f" "$f.corrupt"; fi
  else
    echo "[backup] pg_dump GAGAL"; rm -f "$f.tmp"
  fi
  find "$DIR" -name 'mh_*.dump' -mtime +"$KEEP" -delete
}

# backup awal (jika belum ada backup hari ini)
ls "$DIR"/mh_$(date +%F)_*.dump >/dev/null 2>&1 || do_backup
last=$(date +%F)
while true; do
  sleep 300
  today=$(date +%F); h=$((10#$(date +%H)))
  if [ "$today" != "$last" ] && [ "$h" -ge "$HOUR" ]; then do_backup; last=$today; fi
done
