#!/usr/bin/env bash
# After you upload new project files:  bash deploy/update.sh
set -euo pipefail
cd "$(dirname "$0")/.."
docker compose -f docker-compose.prod.yml build --pull
docker compose -f docker-compose.prod.yml up -d
docker image prune -f
docker compose -f docker-compose.prod.yml ps
