#!/usr/bin/env bash
# Back up hosted images + secret key (AI models are skipped: they re-download by themselves).
# Run daily from cron:  0 3 * * *  /opt/toolzbaba/deploy/backup.sh
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p backups
docker run --rm -v toolzbaba_data:/data:ro -v "$PWD/backups":/backup alpine \
  tar czf "/backup/data-$(date +%F).tar.gz" -C /data --exclude=./models --exclude=./cache .
find backups -name 'data-*.tar.gz' -mtime +14 -delete
echo "Backup saved in $PWD/backups (kept for 14 days). Copy it off the server too (rclone, scp...)."
