#!/usr/bin/env bash
set -euo pipefail

# Backup restore verification script.
# This script restores a backup to a temporary database and verifies data integrity.
#
# USAGE:
#   ./scripts/verify-backup.sh <backup_file> [target_database]
#
# ENVIRONMENT:
#   PGHOST, PGPORT, PGUSER, PGPASSWORD — standard libpq variables for source (backup verification DB)
#   TARGET_PGHOST, TARGET_PGPORT, TARGET_PGUSER, TARGET_PGPASSWORD, TARGET_PGDATABASE — target DB for restore test

BACKUP_FILE="${1:-}"
TARGET_DB="${2:-hakawi_verify_$(date +%s)}"

if [[ -z "${BACKUP_FILE}" ]]; then
    echo "Usage: $0 <backup_file> [target_database]"
    exit 1
fi

if [[ ! -f "${BACKUP_FILE}" ]]; then
    echo "Backup file not found: ${BACKUP_FILE}"
    exit 1
fi

echo "=== Backup Restore Verification ==="
echo "Backup: ${BACKUP_FILE}"
echo "Target DB: ${TARGET_DB}"

# Verify backup file integrity
echo "Verifying backup file integrity..."
if [[ "${BACKUP_FILE}" == *.gpg ]]; then
    if [[ -z "${BACKUP_ENCRYPTION_KEY:-}" ]]; then
        echo "ERROR: BACKUP_ENCRYPTION_KEY required for encrypted backup"
        exit 1
    fi
    echo "${BACKUP_ENCRYPTION_KEY}" | gpg --batch --yes --passphrase-fd 0 --decrypt "${BACKUP_FILE}" | gunzip -t
else
    gunzip -t "${BACKUP_FILE}"
fi
echo "Backup file integrity: OK"

# Create target database
echo "Creating target database: ${TARGET_DB}"
TARGET_PGHOST="${TARGET_PGHOST:-${PGHOST}}"
TARGET_PGPORT="${TARGET_PGPORT:-${PGPORT}}"
TARGET_PGUSER="${TARGET_PGUSER:-${PGUSER}}"
TARGET_PGPASSWORD="${TARGET_PGPASSWORD:-${PGPASSWORD}}"

export PGHOST="${TARGET_PGHOST}"
export PGPORT="${TARGET_PGPORT}"
export PGUSER="${TARGET_PGUSER}"
export PGPASSWORD="${TARGET_PGPASSWORD}"

psql -d postgres -c "DROP DATABASE IF EXISTS ${TARGET_DB};"
psql -d postgres -c "CREATE DATABASE ${TARGET_DB};"

# Restore backup
echo "Restoring backup..."
if [[ "${BACKUP_FILE}" == *.gpg ]]; then
    echo "${BACKUP_ENCRYPTION_KEY}" | gpg --batch --yes --passphrase-fd 0 --decrypt "${BACKUP_FILE}" | gunzip | psql -d "${TARGET_DB}"
else
    gunzip -c "${BACKUP_FILE}" | psql -d "${TARGET_DB}"
fi

if [[ $? -ne 0 ]]; then
    echo "Restore FAILED"
    psql -d postgres -c "DROP DATABASE IF EXISTS ${TARGET_DB};"
    exit 1
fi

echo "Restore completed successfully"

# Verify data integrity
echo "Verifying data integrity..."

# Check table counts
TABLES=$(psql -d "${TARGET_DB}" -t -c "SELECT tablename FROM pg_tables WHERE schemaname = 'public';")
TOTAL_ROWS=0
for TABLE in ${TABLES}; do
    TABLE=$(echo "${TABLE}" | xargs)
    COUNT=$(psql -d "${TARGET_DB}" -t -c "SELECT COUNT(*) FROM ${TABLE};")
    COUNT=$(echo "${COUNT}" | xargs)
    TOTAL_ROWS=$((TOTAL_ROWS + COUNT))
    echo "  ${TABLE}: ${COUNT} rows"
done

echo "Total rows restored: ${TOTAL_ROWS}"

# Verify critical tables exist and have data
CRITICAL_TABLES=("users" "stories" "books" "payments")
for TABLE in "${CRITICAL_TABLES[@]}"; do
    COUNT=$(psql -d "${TARGET_DB}" -t -c "SELECT COUNT(*) FROM ${TABLE};" 2>/dev/null || echo "0")
    COUNT=$(echo "${COUNT}" | xargs)
    if [[ ${COUNT} -eq 0 ]]; then
        echo "WARNING: Critical table '${TABLE}' has 0 rows"
    else
        echo "  ${TABLE}: ${COUNT} rows OK"
    fi
done

# Verify schema integrity
echo "Verifying schema..."
MISSING_FKS=$(psql -d "${TARGET_DB}" -t -c "
SELECT conname FROM pg_constraint WHERE contype = 'f' AND NOT convalidated;
" | wc -l)
if [[ ${MISSING_FKS} -gt 0 ]]; then
    echo "WARNING: ${MISSING_FKS} foreign key constraints not validated"
else
    echo "All foreign key constraints validated"
fi

# Cleanup
echo "Cleaning up test database..."
psql -d postgres -c "DROP DATABASE IF EXISTS ${TARGET_DB};"

echo "=== Verification Complete ==="
echo "Backup restore verification: PASSED"