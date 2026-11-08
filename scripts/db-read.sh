#!/usr/bin/env bash
# Read-only SQL as the least-privileged backend role (sees only schemas backend + tela_read).
# Usage: scripts/db-read.sh "<SELECT ...>"   — output: unaligned, tuples only, '|' separated.
. "$(dirname "$0")/lib.sh"
load_env
cd "$ROOT"
sql="${1:?sql}"
docker compose exec -T -e PGPASSWORD="$BACKEND_DB_PASSWORD" -e PGOPTIONS="-c default_transaction_read_only=on" postgres \
  psql -h 127.0.0.1 -U tela_backend -d tela -v ON_ERROR_STOP=1 -tA -F '|' -c "$sql"
