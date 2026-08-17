#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEST_DIR="$(mktemp -d)"
FAKE_BIN="$TEST_DIR/bin"
TOOL_CACHE_DIR="$TEST_DIR/cache"
COMMAND_LOG="$TEST_DIR/commands.log"

cleanup() {
  rm -rf "$TEST_DIR"
}
trap cleanup EXIT
mkdir -p "$FAKE_BIN"

cat >"$FAKE_BIN/apt-get" <<'SCRIPT'
#!/usr/bin/env bash
set -euo pipefail
[[ "$1" == "download" ]]
shift
for package in "$@"; do
  touch "${package}_test_amd64.deb"
done
printf 'apt-get download\n' >>"$MNOTE_DEV_TEST_COMMAND_LOG"
SCRIPT

cat >"$FAKE_BIN/dpkg-deb" <<'SCRIPT'
#!/usr/bin/env bash
set -euo pipefail
[[ "$1" == "-x" ]]
install_root="$3"
bin_dir="$install_root/usr/lib/postgresql/17/bin"
mkdir -p \
  "$bin_dir" \
  "$install_root/usr/share/postgresql/17/extension" \
  "$install_root/usr/lib/postgresql/17/lib"
for name in postgres pg_ctl initdb pg_isready psql createdb; do
  printf '#!/usr/bin/env bash\nexit 0\n' >"$bin_dir/$name"
  chmod +x "$bin_dir/$name"
done
touch "$install_root/usr/share/postgresql/17/extension/vector.control"
touch "$install_root/usr/lib/postgresql/17/lib/vector.so"
printf 'dpkg-deb\n' >>"$MNOTE_DEV_TEST_COMMAND_LOG"
SCRIPT

cat >"$FAKE_BIN/ldd" <<'SCRIPT'
#!/usr/bin/env bash
exit 0
SCRIPT
chmod +x "$FAKE_BIN"/*

first_output="$({
  PATH="$FAKE_BIN:$PATH" \
    MNOTE_DEV_TEST_COMMAND_LOG="$COMMAND_LOG" \
    MNOTE_DEV_TOOL_CACHE_DIR="$TOOL_CACHE_DIR" \
    "$ROOT/scripts/setup-dev-postgres.sh"
} 2>&1)"
second_output="$({
  PATH="$FAKE_BIN:$PATH" \
    MNOTE_DEV_TEST_COMMAND_LOG="$COMMAND_LOG" \
    MNOTE_DEV_TOOL_CACHE_DIR="$TOOL_CACHE_DIR" \
    "$ROOT/scripts/setup-dev-postgres.sh"
} 2>&1)"

[[ "$first_output" == *"preparing workspace-local PostgreSQL 17 + pgvector"* ]]
[[ "$first_output" == *"workspace-local PostgreSQL tools are ready"* ]]
[[ -z "$second_output" ]]
[[ "$(grep -c '^apt-get download$' "$COMMAND_LOG")" == "1" ]]
[[ "$(grep -c '^dpkg-deb$' "$COMMAND_LOG")" == "3" ]]
[[ -x "$TOOL_CACHE_DIR/postgresql-17/usr/lib/postgresql/17/bin/pg_ctl" ]]
[[ -f "$TOOL_CACHE_DIR/postgresql-17/usr/share/postgresql/17/extension/vector.control" ]]
[[ -f "$TOOL_CACHE_DIR/postgresql-17/usr/lib/postgresql/17/lib/vector.so" ]]

echo "dev PostgreSQL setup integration test passed"
