#!/usr/bin/env bash
# Menerapkan migrasi SQL berurutan sekali saja (dicatat di schema_migrations).
set -euo pipefail
psql -v ON_ERROR_STOP=1 -q -c "create table if not exists schema_migrations(name text primary key, applied_at timestamptz default now())"
for f in /db/migrations/*.sql; do
  n=$(basename "$f")
  if [ "$(psql -Atc "select 1 from schema_migrations where name='$n'")" != "1" ]; then
    echo "apply $n"; psql -v ON_ERROR_STOP=1 -q -f "$f"; psql -q -c "insert into schema_migrations(name) values ('$n')"
  fi
done
# role aplikasi: login + password dari env (tunduk RLS, bukan superuser)
echo "alter role maintainhub_app login password :'pw'" | psql -v ON_ERROR_STOP=1 -q -v pw="$APP_DB_PASSWORD"
echo "alter role maintainhub_auth login password :'pw'" | psql -v ON_ERROR_STOP=1 -q -v pw="$AUTH_DB_PASSWORD"
echo "migrasi selesai"
