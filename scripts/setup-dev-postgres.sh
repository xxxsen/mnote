#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TOOL_CACHE_DIR="${MNOTE_DEV_TOOL_CACHE_DIR:-$ROOT/.cache/mnote-dev-tools}"
if [[ "$TOOL_CACHE_DIR" != /* ]]; then
  TOOL_CACHE_DIR="$ROOT/$TOOL_CACHE_DIR"
fi
INSTALL_ROOT="$TOOL_CACHE_DIR/postgresql-17"
BIN_DIR="$INSTALL_ROOT/usr/lib/postgresql/17/bin"
VECTOR_CONTROL="$INSTALL_ROOT/usr/share/postgresql/17/extension/vector.control"
VECTOR_LIBRARY="$INSTALL_ROOT/usr/lib/postgresql/17/lib/vector.so"
REQUIRED_COMMANDS=(postgres pg_ctl initdb pg_isready psql createdb)

installation_complete() {
  local name
  for name in "${REQUIRED_COMMANDS[@]}"; do
    [[ -x "$BIN_DIR/$name" ]] || return 1
  done
  [[ -f "$VECTOR_CONTROL" && -f "$VECTOR_LIBRARY" ]]
}

if installation_complete; then
  exit 0
fi

for name in apt-get dpkg-deb ldd; do
  if ! command -v "$name" >/dev/null 2>&1; then
    echo "[mnote] cannot prepare local PostgreSQL tools: command not found: $name" >&2
    echo "[mnote] install PostgreSQL 17 with pgvector or set MNOTE_DEV_PG_BIN_DIR" >&2
    exit 1
  fi
done

mkdir -p "$TOOL_CACHE_DIR"
STAGING_DIR="$(mktemp -d "$TOOL_CACHE_DIR/.postgresql-17.XXXXXX")"
cleanup() {
  rm -rf "$STAGING_DIR"
}
trap cleanup EXIT
mkdir -p "$STAGING_DIR/packages" "$STAGING_DIR/root"

echo "[mnote] PostgreSQL server tools are missing; preparing workspace-local PostgreSQL 17 + pgvector"
if ! (
  cd "$STAGING_DIR/packages"
  apt-get download postgresql-17 postgresql-client-17 postgresql-17-pgvector
); then
  echo "[mnote] failed to download PostgreSQL packages from the configured APT repositories" >&2
  echo "[mnote] install PostgreSQL 17 with pgvector or set MNOTE_DEV_PG_BIN_DIR" >&2
  exit 1
fi

for package in "$STAGING_DIR"/packages/*.deb; do
  dpkg-deb -x "$package" "$STAGING_DIR/root"
done

for name in "${REQUIRED_COMMANDS[@]}"; do
  if [[ ! -x "$STAGING_DIR/root/usr/lib/postgresql/17/bin/$name" ]]; then
    echo "[mnote] downloaded PostgreSQL package is missing command: $name" >&2
    exit 1
  fi
done
if [[ ! -f "$STAGING_DIR/root/usr/share/postgresql/17/extension/vector.control" ||
      ! -f "$STAGING_DIR/root/usr/lib/postgresql/17/lib/vector.so" ]]; then
  echo "[mnote] downloaded pgvector package is incomplete" >&2
  exit 1
fi

missing_libraries="$(
  {
    for name in "${REQUIRED_COMMANDS[@]}"; do
      ldd "$STAGING_DIR/root/usr/lib/postgresql/17/bin/$name"
    done
    ldd "$STAGING_DIR/root/usr/lib/postgresql/17/lib/vector.so"
  } | awk '/not found/ { print $1 }' | sort -u
)"
if [[ -n "$missing_libraries" ]]; then
  echo "[mnote] local PostgreSQL is missing host libraries: $missing_libraries" >&2
  echo "[mnote] install the PostgreSQL 17 server package through the system package manager" >&2
  exit 1
fi

if [[ -e "$INSTALL_ROOT" ]]; then
  mv "$INSTALL_ROOT" "$TOOL_CACHE_DIR/postgresql-17.incomplete.$(date +%s)"
fi
mv "$STAGING_DIR/root" "$INSTALL_ROOT"
echo "[mnote] workspace-local PostgreSQL tools are ready in $INSTALL_ROOT"
