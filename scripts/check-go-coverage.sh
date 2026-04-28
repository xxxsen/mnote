#!/usr/bin/env bash
set -euo pipefail

THRESHOLD=${1:-60}
TESTDATA_DIR="testdata"
mkdir -p "${TESTDATA_DIR}"
COVER_PROFILE="${TESTDATA_DIR}/coverage.out"
COVER_PROFILE_FILTERED="${TESTDATA_DIR}/coverage_filtered.out"

# Packages excluded from coverage threshold:
# - db: migration/connection code, needs real PostgreSQL
# - cmd: application entry point with DI wiring
EXCLUDE_PKGS=(
    "internal/db/"
    "cmd/"
)

echo "Running Go tests with coverage (threshold: ${THRESHOLD}%) ..."
GOCACHE=${GOCACHE:-$(go env GOCACHE)} go test -race -coverprofile="${COVER_PROFILE}" -count=1 ./internal/...

echo ""
echo "=== Coverage by function ==="
go tool cover -func="${COVER_PROFILE}"

# Build grep exclude pattern from EXCLUDE_PKGS array.
EXCLUDE_PATTERN=""
for pkg in "${EXCLUDE_PKGS[@]}"; do
    if [ -z "${EXCLUDE_PATTERN}" ]; then
        EXCLUDE_PATTERN="${pkg}"
    else
        EXCLUDE_PATTERN="${EXCLUDE_PATTERN}|${pkg}"
    fi
done

# Filter coverage profile: keep header + lines NOT matching excluded packages.
head -1 "${COVER_PROFILE}" > "${COVER_PROFILE_FILTERED}"
tail -n +2 "${COVER_PROFILE}" | grep -Ev "${EXCLUDE_PATTERN}" >> "${COVER_PROFILE_FILTERED}" || true

COVERAGE=$(go tool cover -func="${COVER_PROFILE_FILTERED}" | grep '^total:' | awk '{print substr($3, 1, length($3)-1)}')
echo ""
echo "Excluded from threshold: ${EXCLUDE_PKGS[*]}"
echo "Total coverage (filtered): ${COVERAGE}%  (threshold: ${THRESHOLD}%)"

if awk "BEGIN {exit (${COVERAGE} < ${THRESHOLD}) ? 0 : 1}"; then
    echo "FAIL: coverage ${COVERAGE}% is below the required ${THRESHOLD}%"
    exit 1
fi

echo "PASS: coverage meets the threshold."
