#!/usr/bin/env bash
# Runs all migrations + SQL security tests against a LOCAL throwaway PostgreSQL (needs psql + a server you can create DBs on).
# Usage: PGUSER=postgres PGHOST=/var/run/postgresql ./scripts/test-db.sh
set -euo pipefail
cd "$(dirname "$0")/.."
DB=german_duo_test
psql -v ON_ERROR_STOP=1 -q -d postgres -c "drop database if exists $DB" -c "create database $DB"
run() { psql -v ON_ERROR_STOP=1 -q -o /dev/null -d "$DB" -f "$1"; }
run supabase/tests/00_stub_supabase.sql
for f in supabase/migrations/*.sql; do echo "migrate: $f"; run "$f"; done
run supabase/tests/10_rls.test.sql
echo "DB tests finished"
