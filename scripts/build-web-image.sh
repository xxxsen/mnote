#!/usr/bin/env bash
set -euo pipefail

docker build -t xxxsen/mnote-web -f web/Dockerfile web
