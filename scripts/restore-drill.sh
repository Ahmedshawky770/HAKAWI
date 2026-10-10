#!/usr/bin/env bash
set -euo pipefail

# Monthly restore drill script.
# This script performs a full restore test and reports results.
# Should be run monthly via cron or CI/CD.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
LATEST_BACKUP=$(ls -1t "${BACKUP_DIR}"/hakawi-*.sql.gz* 2>/dev/null | head -1)

if [[ -z "${LATEST_BACKUP}" ]]; then
    echo "No backup found in ${BACKUP_DIR}"
    exit 1
fi

echo "=== Monthly Restore Drill ==="
echo "Testing backup: ${LATEST_BACKUP}"

# Run verification
"${SCRIPT_DIR}/verify-backup.sh" "${LATEST_BACKUP}" "hakawi_restore_drill_$(date +%s)"

if [[ $? -eq 0 ]]; then
    echo "Monthly restore drill: PASSED"
    # Send success notification (configure as needed)
    # curl -X POST "${SLACK_WEBHOOK_URL}" -d '{"text": "✅ Hakawi monthly restore drill PASSED"}'
else
    echo "Monthly restore drill: FAILED"
    # Send failure notification
    # curl -X POST "${SLACK_WEBHOOK_URL}" -d '{"text": "❌ Hakawi monthly restore drill FAILED - investigate immediately"}'
    exit 1
fi