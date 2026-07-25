#!/usr/bin/env bash
# Start the MNote backend, web app, and an isolated pgvector database for
# local development. Process lifecycle follows the same host-shell model as
# Fireman's dev runner; no devcontainer is required.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WEB_DIR="$ROOT/web"
COMPOSE_FILE="$ROOT/docker/docker-compose.dev.yml"
DEV_DATA_DIR="${MNOTE_DEV_DATA_DIR:-$ROOT/.dev-data}"
if [[ "$DEV_DATA_DIR" != /* ]]; then
  DEV_DATA_DIR="$ROOT/$DEV_DATA_DIR"
fi
DEFAULT_CONFIG_PATH="$DEV_DATA_DIR/config.json"
CONFIG_PATH="${MNOTE_DEV_CONFIG:-${1:-$DEFAULT_CONFIG_PATH}}"
BACKEND_PORT="${MNOTE_DEV_BACKEND_PORT:-8850}"
WEB_PORT="${MNOTE_DEV_WEB_PORT:-3090}"
DB_PORT="${MNOTE_DEV_DB_PORT:-15432}"
BACKEND_URL="${MNOTE_DEV_BACKEND_URL:-http://127.0.0.1:$BACKEND_PORT}"
API_BASE="${MNOTE_DEV_API_BASE:-$BACKEND_URL/api/v1}"
DOCKER="${DOCKER:-docker}"

if [[ "$CONFIG_PATH" != /* ]]; then
  CONFIG_PATH="$ROOT/$CONFIG_PATH"
fi

mkdir -p "$DEV_DATA_DIR/uploads"
PID_DIR="${MNOTE_DEV_PID_DIR:-${TMPDIR:-/tmp}}"
mkdir -p "$PID_DIR"
ROOT_HASH="$(printf '%s' "$ROOT" | cksum | awk '{print $1}')"
PID_FILE="${MNOTE_DEV_PID_FILE:-$PID_DIR/mnote-dev-$ROOT_HASH.pids}"
COMPOSE_PROJECT="${MNOTE_DEV_COMPOSE_PROJECT:-mnote-dev-$ROOT_HASH}"

pids=()
database_started=false

is_true() {
  case "${1:-}" in
    1|true|TRUE|yes|YES) return 0 ;;
    *) return 1 ;;
  esac
}

require_command() {
  local name="$1"
  if ! command -v "$name" >/dev/null 2>&1; then
    echo "[mnote] required command not found: $name" >&2
    exit 1
  fi
}

compose() {
  MNOTE_DEV_DB_PORT="$DB_PORT" "$DOCKER" compose \
    -p "$COMPOSE_PROJECT" -f "$COMPOSE_FILE" "$@"
}

proc_start_time() {
  local pid="$1"
  awk '{print $22}' "/proc/$pid/stat" 2>/dev/null || true
}

record_pid() {
  local pid="$1"
  local label="$2"
  local started
  started="$(proc_start_time "$pid")"
  printf '%s %s %s\n' "$pid" "$started" "$label" >>"$PID_FILE"
  pids+=("$pid")
}

wait_for_backend() {
  local pid="$1"
  local attempt

  echo "[mnote] waiting for backend readiness on :$BACKEND_PORT"
  for ((attempt = 1; attempt <= 120; attempt++)); do
    if ! kill -0 "$pid" 2>/dev/null; then
      echo "[mnote] backend exited before becoming ready" >&2
      wait "$pid" 2>/dev/null || true
      exit 1
    fi
    if (exec 3<>"/dev/tcp/127.0.0.1/$BACKEND_PORT") 2>/dev/null; then
      echo "[mnote] backend is ready on :$BACKEND_PORT"
      return 0
    fi
    sleep 1
  done

  echo "[mnote] backend did not become ready on :$BACKEND_PORT" >&2
  exit 1
}

kill_tree() {
  local pid="$1"
  local child
  while read -r child; do
    [[ -n "$child" ]] && kill_tree "$child"
  done < <(pgrep -P "$pid" 2>/dev/null || true)
  if kill -0 "$pid" 2>/dev/null; then
    kill "$pid" 2>/dev/null || true
  fi
}

kill_recorded_pid() {
  local pid="$1"
  local expected_start="$2"
  local label="$3"
  local current_start

  [[ -n "$pid" ]] || return 0
  kill -0 "$pid" 2>/dev/null || return 0

  current_start="$(proc_start_time "$pid")"
  if [[ -n "$expected_start" && -n "$current_start" && "$current_start" != "$expected_start" ]]; then
    echo "[mnote] skip stale $label pid=$pid; process id was reused"
    return 0
  fi

  echo "[mnote] stopping stale $label pid=$pid"
  kill_tree "$pid"
}

cleanup_previous() {
  [[ -f "$PID_FILE" ]] || return 0

  echo "[mnote] cleaning previous dev processes from $PID_FILE"
  while read -r pid started label; do
    kill_recorded_pid "$pid" "$started" "${label:-process}"
  done <"$PID_FILE"
  rm -f "$PID_FILE"
}

cleanup() {
  trap - INT TERM EXIT
  for pid in "${pids[@]:-}"; do
    kill_recorded_pid "$pid" "$(proc_start_time "$pid")" "process"
  done
  wait 2>/dev/null || true
  rm -f "$PID_FILE"

  if $database_started && ! is_true "${MNOTE_DEV_KEEP_DB:-}"; then
    echo "[mnote] stopping development database"
    compose stop db >/dev/null 2>&1 || true
  fi
}

generate_config() {
  cat >"$CONFIG_PATH" <<JSON
{
  "database": {
    "host": "127.0.0.1",
    "port": $DB_PORT,
    "user": "mnote",
    "password": "mnote_pass",
    "dbname": "mnote",
    "sslmode": "disable"
  },
  "jwt_secret": "mnote-local-development-only",
  "port": $BACKEND_PORT,
  "log_config": {
    "level": "debug",
    "console": true
  },
  "cors": {
    "allow_origins": [
      "http://localhost:$WEB_PORT",
      "http://127.0.0.1:$WEB_PORT"
    ]
  },
  "file_store": {
    "type": "local",
    "data": {
      "dir": "$DEV_DATA_DIR/uploads"
    }
  },
  "ai": {
    "enabled": false,
    "embed": []
  },
  "ai_job": {
    "embedding_delay_seconds": 300
  },
  "oauth": {
    "github": {},
    "google": {}
  },
  "mail": {},
  "properties": {
    "enable_github_oauth": false,
    "enable_google_oauth": false,
    "enable_user_register": true,
    "enable_email_register": false,
    "enable_test_mode": true
  }
}
JSON
}

require_command go
require_command npm
require_command pgrep
require_command awk
require_command cksum

if [[ ! -x "$WEB_DIR/node_modules/.bin/next" ]]; then
  echo "[mnote] web dependencies are missing; run 'make web-install' first" >&2
  exit 1
fi
if ! is_true "${MNOTE_DEV_SKIP_DB:-}"; then
  require_command "$DOCKER"
  require_command seq
  if ! "$DOCKER" compose version >/dev/null 2>&1; then
    echo "[mnote] Docker Compose v2 is required" >&2
    exit 1
  fi
fi

if [[ "$CONFIG_PATH" == "$DEFAULT_CONFIG_PATH" ]]; then
  generate_config
elif [[ ! -f "$CONFIG_PATH" ]]; then
  echo "[mnote] development config not found: $CONFIG_PATH" >&2
  exit 1
fi

cleanup_previous
: >"$PID_FILE"
trap cleanup INT TERM EXIT

if ! is_true "${MNOTE_DEV_SKIP_DB:-}"; then
  echo "[mnote] starting isolated pgvector database on :$DB_PORT"
  database_started=true
  compose up -d db

  ready=false
  for _ in $(seq 1 30); do
    if compose exec -T db pg_isready -U mnote -d mnote >/dev/null 2>&1; then
      ready=true
      break
    fi
    sleep 1
  done
  if ! $ready; then
    echo "[mnote] database did not become ready" >&2
    compose logs db >&2 || true
    exit 1
  fi
fi

# Production builds and next dev cannot safely share generated chunks.
rm -rf "$WEB_DIR/.next"

echo "[mnote] starting backend on :$BACKEND_PORT with config=$CONFIG_PATH"
(
  cd "$ROOT"
  go run ./cmd/mnote run --config="$CONFIG_PATH"
) &
backend_pid="$!"
record_pid "$backend_pid" "backend"
wait_for_backend "$backend_pid"

echo "[mnote] starting web on :$WEB_PORT with API=$API_BASE"
(
  cd "$WEB_DIR"
  NEXT_PUBLIC_API_BASE="$API_BASE" npm run dev -- --port "$WEB_PORT"
) &
record_pid "$!" "web"

if [[ "$CONFIG_PATH" == "$DEFAULT_CONFIG_PATH" ]]; then
  echo "[mnote] test login: test@test.com / test"
fi
wait -n
