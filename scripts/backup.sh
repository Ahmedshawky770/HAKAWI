#!/usr/bin/env bash
set -euo pipefail

# Automated database backup script.
#
# WHY THIS EXISTS. The product's data lives in PostgreSQL, and without a backup
# strategy a single hardware failure or operator mistake can erase months of
# content. This script produces a timestamped dump and rotates old backups so
# the disk does not fill up.
#
# USAGE:
#   ./scripts/backup.sh [output_dir]
#
# ENVIRONMENT:
#   PGHOST, PGPORT, PGUSER, PGDATABASE, PGPASSWORD — standard libpq variables.

OUTPUT_DIR="${1:-./backups}"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_FILE="${OUTPUT_DIR}/hakawi-${TIMESTAMP}.sql.gz"

mkdir -p "${OUTPUT_DIR}"

echo "Creating backup: ${BACKUP_FILE}"

pg_dump --format=plain --no-owner --no-acl | gzip > "${BACKUP_FILE}"

echo "Backup created: ${BACKUP_FILE}"

# Retain the 30 most recent backups.
ls -1t "${OUTPUT_DIR}"/hakawi-*.sql.gz 2>/dev/null | tail -n +31 | xargs -r rm -f

echo "Old backups rotated."
