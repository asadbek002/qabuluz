#!/bin/sh
# Backs up the database and uploaded documents. Run from the project folder, e.g. daily via cron:
#   0 3 * * * cd /opt/qabuluz && ./deploy/backup.sh >> backups/backup.log 2>&1
set -eu
KEEP_DAYS="${KEEP_DAYS:-14}"
STAMP="$(date +%Y%m%d-%H%M%S)"
mkdir -p backups
docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB"' | gzip > "backups/db-$STAMP.sql.gz"
tar -czf "backups/uploads-$STAMP.tar.gz" -C data uploads
find backups -name '*.gz' -mtime +"$KEEP_DAYS" -delete
echo "Backup done: $STAMP"
