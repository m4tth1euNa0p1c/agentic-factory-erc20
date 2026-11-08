#!/bin/sh
# Least-privilege layout (Constitution §V):
#   db tela          schema backend   -> owned by tela_backend
#                    schema ponder_tela, tela_read -> owned by tela_ponder (indexer)
#                    tela_backend gets SELECT on tela_read only (views published by Ponder)
#   db tela_adapter  -> owned by tela_adapter (tx attempts journal)
set -eu
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<SQL
CREATE ROLE tela_backend LOGIN PASSWORD '${BACKEND_DB_PASSWORD}';
CREATE ROLE tela_ponder  LOGIN PASSWORD '${PONDER_DB_PASSWORD}';
CREATE ROLE tela_adapter LOGIN PASSWORD '${ADAPTER_DB_PASSWORD}';

REVOKE ALL ON DATABASE tela FROM PUBLIC;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT CONNECT ON DATABASE tela TO tela_backend, tela_ponder;

CREATE SCHEMA backend AUTHORIZATION tela_backend;
CREATE SCHEMA ponder_tela AUTHORIZATION tela_ponder;
CREATE SCHEMA tela_read AUTHORIZATION tela_ponder;
GRANT CREATE ON DATABASE tela TO tela_ponder;   -- ponder manages its own internal schemas

GRANT USAGE ON SCHEMA tela_read TO tela_backend;
ALTER DEFAULT PRIVILEGES FOR ROLE tela_ponder IN SCHEMA tela_read GRANT SELECT ON TABLES TO tela_backend;
ALTER ROLE tela_backend SET search_path = backend, tela_read;

CREATE DATABASE tela_adapter OWNER tela_adapter;
REVOKE ALL ON DATABASE tela_adapter FROM PUBLIC;
SQL
