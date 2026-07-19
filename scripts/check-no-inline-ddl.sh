#!/usr/bin/env bash
set -euo pipefail

DDL_PATTERN='\b(create|alter|drop|truncate|comment[[:space:]]+on|grant|revoke)[[:space:]]+(table|index|extension|type|constraint|schema|view|materialized|function|trigger|sequence|role)\b'

if rg -n -i "${DDL_PATTERN}" \
    cmd internal scripts docker .github Makefile \
    --glob '*.go' \
    --glob '*.sh' \
    --glob '*.yml' \
    --glob '*.yaml' \
    --glob 'Makefile' \
    --glob '!**/*_test.go' \
    --glob '!internal/testutil/**' \
    --glob '!internal/db/migrations/*.sql'; then
    echo "DDL must be defined only in internal/db/migrations/*.sql"
    exit 1
fi

unexpected_sql=$(
    rg --files \
        --glob '*.sql' \
        --glob '!internal/db/migrations/*.sql' \
        --glob '!scripts/audit-db.sql' \
        --glob '!**/testdata/**' ||
        true
)
if [[ -n "${unexpected_sql}" ]]; then
    echo "SQL migration files outside internal/db/migrations are not allowed:"
    echo "${unexpected_sql}"
    exit 1
fi

READ_ONLY_AUDIT_MUTATION_PATTERN='\b(insert|update|delete|merge|copy|call|do|create|alter|drop|truncate|grant|revoke)\b'
if rg -n -i "${READ_ONLY_AUDIT_MUTATION_PATTERN}" scripts/audit-db.sql; then
    echo "scripts/audit-db.sql must remain read-only"
    exit 1
fi
