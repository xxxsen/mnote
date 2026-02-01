#!/usr/bin/env bash
set -euo pipefail

CONFIG_PATH=${1:-config.json}

go run cmd/mnote/main.go run --config="${CONFIG_PATH}"
