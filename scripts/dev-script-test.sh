#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 is required for the dev script integration test" >&2
  exit 1
fi
TEST_DIR="$(mktemp -d)"
FAKE_BIN="$TEST_DIR/bin"
STATE_DIR="$TEST_DIR/state"
DEV_DATA_DIR="$TEST_DIR/dev-data"
COMMAND_LOG="$STATE_DIR/commands.log"
BACKEND_PORT="$((28000 + $$ % 1000))"
WEB_PORT="$((30000 + $$ % 1000))"
DB_PORT="$((32000 + $$ % 1000))"

cleanup() {
  if [[ -f "$STATE_DIR/postgres.pid" ]]; then
    kill "$(cat "$STATE_DIR/postgres.pid")" 2>/dev/null || true
  fi
  rm -rf "$TEST_DIR"
}
trap cleanup EXIT

mkdir -p "$FAKE_BIN" "$STATE_DIR"

cat >"$FAKE_BIN/initdb" <<'SCRIPT'
#!/usr/bin/env bash
set -euo pipefail
data_dir=""
original_args="$*"
while (($#)); do
  if [[ "$1" == "-D" ]]; then
    data_dir="$2"
    shift 2
    continue
  fi
  shift
done
mkdir -p "$data_dir"
printf '17\n' >"$data_dir/PG_VERSION"
printf 'initdb %s\n' "$original_args" >>"$MNOTE_DEV_TEST_COMMAND_LOG"
SCRIPT

cat >"$FAKE_BIN/pg_ctl" <<'SCRIPT'
#!/usr/bin/env bash
set -euo pipefail
action=""
for argument in "$@"; do
  case "$argument" in
    start|status|stop) action="$argument" ;;
  esac
done
case "$action" in
  start)
    sleep 300 &
    printf '%s\n' "$!" >"$MNOTE_DEV_TEST_STATE/postgres.pid"
    printf 'pg_ctl start\n' >>"$MNOTE_DEV_TEST_COMMAND_LOG"
    ;;
  status)
    if [[ -f "$MNOTE_DEV_TEST_STATE/postgres.pid" ]] &&
      kill -0 "$(cat "$MNOTE_DEV_TEST_STATE/postgres.pid")" 2>/dev/null; then
      exit 0
    fi
    exit 3
    ;;
  stop)
    if [[ -f "$MNOTE_DEV_TEST_STATE/postgres.pid" ]]; then
      kill "$(cat "$MNOTE_DEV_TEST_STATE/postgres.pid")" 2>/dev/null || true
      rm -f "$MNOTE_DEV_TEST_STATE/postgres.pid"
    fi
    printf 'pg_ctl stop\n' >>"$MNOTE_DEV_TEST_COMMAND_LOG"
    ;;
  *) exit 2 ;;
esac
SCRIPT

cat >"$FAKE_BIN/pg_isready" <<'SCRIPT'
#!/usr/bin/env bash
printf 'pg_isready\n' >>"$MNOTE_DEV_TEST_COMMAND_LOG"
SCRIPT

cat >"$FAKE_BIN/psql" <<'SCRIPT'
#!/usr/bin/env bash
set -euo pipefail
[[ "${PGPASSWORD:-}" == "mnote_pass" ]]
if [[ "$*" == *"pg_database"* ]]; then
  [[ -f "$MNOTE_DEV_TEST_STATE/database-created" ]] && printf '1\n'
elif [[ "$*" == *"pg_available_extensions"* ]]; then
  printf '1\n'
else
  exit 2
fi
printf 'psql\n' >>"$MNOTE_DEV_TEST_COMMAND_LOG"
SCRIPT

cat >"$FAKE_BIN/createdb" <<'SCRIPT'
#!/usr/bin/env bash
set -euo pipefail
[[ "${PGPASSWORD:-}" == "mnote_pass" ]]
touch "$MNOTE_DEV_TEST_STATE/database-created"
printf 'createdb\n' >>"$MNOTE_DEV_TEST_COMMAND_LOG"
SCRIPT

cat >"$FAKE_BIN/go" <<'SCRIPT'
#!/usr/bin/env bash
set -euo pipefail
printf 'go %s\n' "$*" >>"$MNOTE_DEV_TEST_COMMAND_LOG"
exec python3 - "$MNOTE_DEV_BACKEND_PORT" <<'PYTHON'
import socket
import sys

server = socket.socket()
server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
server.bind(("127.0.0.1", int(sys.argv[1])))
server.listen()
while True:
    connection, _ = server.accept()
    connection.close()
PYTHON
SCRIPT

cat >"$FAKE_BIN/npm" <<'SCRIPT'
#!/usr/bin/env bash
printf 'npm %s\n' "$*" >>"$MNOTE_DEV_TEST_COMMAND_LOG"
sleep 1
SCRIPT

cat >"$FAKE_BIN/docker" <<'SCRIPT'
#!/usr/bin/env bash
touch "$MNOTE_DEV_TEST_STATE/docker-called"
exit 99
SCRIPT

chmod +x "$FAKE_BIN"/*

run_dev() {
  PATH="$FAKE_BIN:$PATH" \
    MNOTE_DEV_TEST_STATE="$STATE_DIR" \
    MNOTE_DEV_TEST_COMMAND_LOG="$COMMAND_LOG" \
    MNOTE_DEV_DATA_DIR="$DEV_DATA_DIR" \
    MNOTE_DEV_PG_BIN_DIR="$FAKE_BIN" \
    MNOTE_DEV_PID_FILE="$TEST_DIR/dev.pids" \
    MNOTE_DEV_BACKEND_PORT="$BACKEND_PORT" \
    MNOTE_DEV_WEB_PORT="$WEB_PORT" \
    MNOTE_DEV_DB_PORT="$DB_PORT" \
    "$ROOT/scripts/dev.sh"
}

first_output="$(run_dev 2>&1)"
second_output="$(run_dev 2>&1)"

[[ "$first_output" == *"initializing local PostgreSQL data"* ]]
[[ "$first_output" == *"starting local pgvector database"* ]]
[[ "$first_output" == *"backend is ready"* ]]
[[ "$first_output" == *"starting web"* ]]
[[ "$second_output" != *"initializing local PostgreSQL data"* ]]
[[ "$second_output" != *"creating local development database"* ]]
[[ "$second_output" == *"backend is ready"* ]]
[[ -f "$DEV_DATA_DIR/postgres/PG_VERSION" ]]
[[ -f "$STATE_DIR/database-created" ]]
[[ "$(grep -c '^initdb ' "$COMMAND_LOG")" == "1" ]]
grep -q -- '--auth-host=scram-sha-256' "$COMMAND_LOG"
[[ "$(grep -c '^createdb$' "$COMMAND_LOG")" == "1" ]]
[[ "$(grep -c '^pg_ctl start$' "$COMMAND_LOG")" == "2" ]]
[[ "$(grep -c '^pg_ctl stop$' "$COMMAND_LOG")" == "2" ]]
grep -q '^go run ./cmd/mnote run --config=' "$COMMAND_LOG"
grep -q '^npm run dev -- --port ' "$COMMAND_LOG"
[[ ! -e "$STATE_DIR/docker-called" ]]

echo "dev script local-process integration test passed"
