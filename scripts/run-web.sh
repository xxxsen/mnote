#!/usr/bin/env bash
set -euo pipefail

cd web
NEXT_PUBLIC_API_BASE=http://localhost:8080/api/v1 npm run dev
