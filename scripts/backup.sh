#!/usr/bin/env bash
set -euo pipefail

# Automated database backup script with verification and off-site replication.
#
# WHY THIS EXISTS. The product's data lives in PostgreSQL, and without a backup
# strategy a single hardware failure or operator mistake can erase months of
# content. This script produces a timestamped dump, verifies it, and optionally
# replicates it off-site.
#
# USAGE:
#   ./scripts/backup.sh [output_dir]
#
# ENVIRONMENT:
#   PGHOST, PGPORT, PGUSER, PGDATABASE, PGPASSWORD — standard libpq variables.
#   BACKUP_S3_BUCKET — S3 bucket for off-site replication (optional)
#   BACKUP_S3_PREFIX — S3 key prefix (optional, default: backups/)
#   BACKUP_RETENTION_DAYS — Local retention in days (default: 30)
#   BACKUP_S3_RETENTION_DAYS — S3 retention in days (default: 90)
#   BACKUP_ENCRYPTION_KEY — GPG key for encryption (optional)
#   BACKUP_VERIFY — Set to "true" to verify backup integrity (default: true)

OUTPUT_DIR="${1:-./backups}"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_FILE="${OUTPUT_DIR}/hakawi-${TIMESTAMP}.sql.gz"
BACKUP_FILE_ENCRYPTED="${BACKUP_FILE}.gpg"
BACKUP_MANIFEST="${OUTPUT_DIR}/hakawi-${TIMESTAMP}.manifest.json"

# Configuration
BACKUP_S3_BUCKET="${BACKUP_S3_BUCKET:-}"
BACKUP_S3_PREFIX="${BACKUP_S3_PREFIX:-backups/}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
BACKUP_S3_RETENTION_DAYS="${BACKUP_S3_RETENTION_DAYS:-90}"
BACKUP_ENCRYPTION_KEY="${BACKUP_ENCRYPTION_KEY:-}"
BACKUP_VERIFY="${BACKUP_VERIFY:-true}"

mkdir -p "${OUTPUT_DIR}"

echo "=== Hakawi Database Backup ==="
echo "Timestamp: ${TIMESTAMP}"
echo "Output: ${BACKUP_FILE}"

# Create the backup
echo "Creating backup..."
pg_dump --format=plain --no-owner --no-acl | gzip > "${BACKUP_FILE}"

BACKUP_SIZE=$(stat -c%s "${BACKUP_FILE}")
BACKUP_SHA256=$(sha256sum "${BACKUP_FILE}" | cut -d' ' -f1)

echo "Backup created: ${BACKUP_FILE} (${BACKUP_SIZE} bytes, SHA256: ${BACKUP_SHA256})"

# Create manifest
cat > "${BACKUP_MANIFEST}" <<EOF
{
  "timestamp": "${TIMESTAMP}",
  "database": "${PGDATABASE}",
  "host": "${PGHOST}",
  "file": "$(basename "${BACKUP_FILE}")",
  "size_bytes": ${BACKUP_SIZE},
  "sha256": "${BACKUP_SHA256}",
  "encrypted": false,
  "pg_version": "$(pg_dump --version | head -1)"
}
EOF

# Encrypt if key provided
if [[ -n "${BACKUP_ENCRYPTION_KEY}" ]]; then
    echo "Encrypting backup..."
    echo "${BACKUP_ENCRYPTION_KEY}" | gpg --batch --yes --passphrase-fd 0 --symmetric --cipher-algo AES256 "${BACKUP_FILE}"
    rm "${BACKUP_FILE}"
    BACKUP_FILE="${BACKUP_FILE_ENCRYPTED}"
    BACKUP_SIZE=$(stat -c%s "${BACKUP_FILE}")
    BACKUP_SHA256=$(sha256sum "${BACKUP_FILE}" | cut -d' ' -f1)
    
    # Update manifest
    cat > "${BACKUP_MANIFEST}" <<EOF
{
  "timestamp": "${TIMESTAMP}",
  "database": "${PGDATABASE}",
  "host": "${PGHOST}",
  "file": "$(basename "${BACKUP_FILE}")",
  "size_bytes": ${BACKUP_SIZE},
  "sha256": "${BACKUP_SHA256}",
  "encrypted": true,
  "pg_version": "$(pg_dump --version | head -1)"
}
EOF
    echo "Backup encrypted: ${BACKUP_FILE}"
fi

# Verify backup integrity
if [[ "${BACKUP_VERIFY}" == "true" ]]; then
    echo "Verifying backup integrity..."
    if [[ "${BACKUP_FILE}" == *.gpg ]]; then
        echo "${BACKUP_ENCRYPTION_KEY}" | gpg --batch --yes --passphrase-fd 0 --decrypt "${BACKUP_FILE}" | gunzip -t
    else
        gunzip -t "${BACKUP_FILE}"
    fi
    if [[ $? -eq 0 ]]; then
        echo "Backup verification: PASSED"
    else
        echo "Backup verification: FAILED"
        exit 1
    fi
fi

# Off-site replication to S3
if [[ -n "${BACKUP_S3_BUCKET}" ]]; then
    echo "Replicating to S3: s3://${BACKUP_S3_BUCKET}/${BACKUP_S3_PREFIX}$(basename "${BACKUP_FILE}")"
    aws s3 cp "${BACKUP_FILE}" "s3://${BACKUP_S3_BUCKET}/${BACKUP_S3_PREFIX}$(basename "${BACKUP_FILE}")"
    aws s3 cp "${BACKUP_MANIFEST}" "s3://${BACKUP_S3_BUCKET}/${BACKUP_S3_PREFIX}$(basename "${BACKUP_MANIFEST}")"
    echo "S3 replication complete"
    
    # Clean old S3 backups
    if [[ ${BACKUP_S3_RETENTION_DAYS} -gt 0 ]]; then
        echo "Cleaning S3 backups older than ${BACKUP_S3_RETENTION_DAYS} days..."
        aws s3 ls "s3://${BACKUP_S3_BUCKET}/${BACKUP_S3_PREFIX}" | while read -r line; do
            FILE_DATE=$(echo "${line}" | awk '{print $1}')
            FILE_NAME=$(echo "${line}" | awk '{print $4}')
            if [[ "${FILE_NAME}" == hakawi-* ]]; then
                FILE_EPOCH=$(date -d "${FILE_DATE}" +%s 2>/dev/null || date -j -f "%Y-%m-%d" "${FILE_DATE}" +%s 2>/dev/null)
                NOW_EPOCH=$(date +%s)
                AGE_DAYS=$(( (NOW_EPOCH - FILE_EPOCH) / 86400 ))
                if [[ ${AGE_DAYS} -gt ${BACKUP_S3_RETENTION_DAYS} ]]; then
                    aws s3 rm "s3://${BACKUP_S3_BUCKET}/${BACKUP_S3_PREFIX}${FILE_NAME}"
                    echo "Removed old S3 backup: ${FILE_NAME}"
                fi
            fi
        done
    fi
fi

# Local rotation
echo "Rotating local backups (retention: ${BACKUP_RETENTION_DAYS} days)..."
find "${OUTPUT_DIR}" -name "hakawi-*.sql.gz" -o -name "hakawi-*.sql.gz.gpg" -o -name "hakawi-*.manifest.json" | while read -r file; do
    FILE_DATE=$(basename "${file}" | sed -E 's/hakawi-([0-9]{8}-[0-9]{6}).*/\1/')
    if [[ "${FILE_DATE}" =~ ^[0-9]{8}-[0-9]{6}$ ]]; then
        FILE_EPOCH=$(date -d "${FILE_DATE:0:4}-${FILE_DATE:4:2}-${FILE_DATE:6:2} ${FILE_DATE:9:2}:${FILE_DATE:11:2}:${FILE_DATE:13:2}" +%s 2>/dev/null || date -j -f "%Y%m%d-%H%M%S" "${FILE_DATE}" +%s 2>/dev/null)
        NOW_EPOCH=$(date +%s)
        AGE_DAYS=$(( (NOW_EPOCH - FILE_EPOCH) / 86400 ))
        if [[ ${AGE_DAYS} -gt ${BACKUP_RETENTION_DAYS} ]]; then
            rm -f "${file}"
            echo "Removed old local backup: $(basename "${file}")"
        fi
    fi
done

echo "=== Backup Complete ==="
echo "File: ${BACKUP_FILE}"
echo "Manifest: ${BACKUP_MANIFEST}"
echo "SHA256: ${BACKUP_SHA256}"