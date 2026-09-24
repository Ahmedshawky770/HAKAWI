# Backup Strategy

## Overview

This document defines the backup and disaster recovery strategy for Hakawi. It covers database backups, Valkey persistence, file storage backups, backup schedules, restore procedures, and disaster recovery planning.

---

## 1. Database Backup Strategy

### 1.1 PostgreSQL Backup Approach

Hakawi uses PostgreSQL as the primary datastore. Backups are performed using `pg_dump` for logical backups and PostgreSQL WAL (Write-Ahead Log) archiving for point-in-time recovery.

### 1.2 pg_dump Logical Backups

- **Tool:** `pg_dump` with custom format (`-Fc`)
- **Frequency:** Daily full backup at 02:00 AM server time
- **Retention:** 30 days of daily backups, 12 monthly backups
- **Compression:** gzip compression applied after dump
- **Storage:** S3/R2 bucket `hakawi-backups/postgresql/`

```bash
pg_dump -Fc -Z9 -f /tmp/hakawi.dump hakawi_production
```

### 1.3 WAL Archiving

- **Purpose:** Enables Point-in-Time Recovery (PITR)
- **Configuration:**
  - `wal_level = replica`
  - `archive_mode = on`
  - `archive_command = 'aws s3 cp %p s3://hakawi-backups/wal/%f'`
  - `archive_timeout = 300` (5 minutes)
- **Retention:** WAL files retained for 30 days
- **Verification:** Monthly test restore to validate WAL integrity

### 1.4 Automated Backup Script

Location: `/opt/hakawi/scripts/backup-postgres.sh`

```bash
#!/usr/bin/env bash
set -euo pipefail

DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/tmp/hakawi-backups"
S3_BUCKET="hakawi-backups"
DB_NAME="hakawi_production"

mkdir -p "$BACKUP_DIR"

# Full dump
pg_dump -Fc -Z9 -f "$BACKUP_DIR/hakawi_$DATE.dump" "$DB_NAME"

# Upload to S3/R2
aws s3 cp "$BACKUP_DIR/hakawi_$DATE.dump" "s3://$S3_BUCKET/postgresql/hakawi_$DATE.dump" --storage-class GLACIER_IR

# Cleanup local
rm -f "$BACKUP_DIR/hakawi_$DATE.dump"

# Retention cleanup (30 days)
aws s3 ls "s3://$S3_BUCKET/postgresql/" | awk '{print $4}' | while read -r file; do
  if [[ "$file" =~ hakawi_[0-9]{8}_[0-9]{6}\.dump ]]; then
    FILE_DATE=$(echo "$file" | grep -oP '[0-9]{8}')
    FILE_AGE=$(( ($(date +%s) - $(date -d "$FILE_DATE" +%s)) / 86400 ))
    if [ "$FILE_AGE" -gt 30 ]; then
      aws s3 rm "s3://$S3_BUCKET/postgresql/$file"
    fi
  fi
done
```

---

## 2. Valkey Persistence Strategy

### 2.1 Persistence Modes

Hakawi uses Valkey (Redis-compatible) for caching and session management. The persistence strategy balances data safety with performance.

### 2.2 RDB (Redis Database) Snapshots

- **Configuration:**
  - `save 900 1` - Save snapshot if at least 1 key changed in 15 minutes
  - `save 300 10` - Save snapshot if at least 10 keys changed in 5 minutes
  - `save 60 10000` - Save snapshot if at least 10000 keys changed in 1 minute
- **File:** `dump.rdb`
- **Location:** `/var/lib/valkey/dump.rdb` (persistent volume)
- **Backup:** Daily copy to S3/R2 `hakawi-backups/valkey/rdb/`

### 2.3 AOF (Append-Only File)

- **Configuration:**
  - `appendonly yes`
  - `appendfsync everysec` - fsync every second (safe and fast)
  - `auto-aof-rewrite-percentage 100`
  - `auto-aof-rewrite-min-size 64mb`
- **File:** `appendonly.aof`
- **Backup:** Daily copy to S3/R2 `hakawi-backups/valkey/aof/`
- **Note:** AOF provides better durability than RDB but is slightly slower

### 2.4 Valkey Backup Script

Location: `/opt/hakawi/scripts/backup-valkey.sh`

```bash
#!/usr/bin/env bash
set -euo pipefail

DATE=$(date +%Y%m%d_%H%M%S)
S3_BUCKET="hakawi-backups"

# BGSAVE for RDB
valkey-cli BGSAVE

# Wait for background save to complete
while [ "$(valkey-cli LASTSAVE)" != "$(valkey-cli INFO persistence | grep 'rdb_last_save_time' | cut -d: -f2)" ]; do
  sleep 1
done

# Copy RDB and AOF to backup
aws s3 cp /var/lib/valkey/dump.rdb "s3://$S3_BUCKET/valkey/rdb/dump_$DATE.rdb" --storage-class GLACIER_IR
aws s3 cp /var/lib/valkey/appendonly.aof "s3://$S3_BUCKET/valkey/aof/aof_$DATE.aof" --storage-class GLACIER_IR
```

---

## 3. File Storage Backup

### 3.1 S3 / R2 Object Storage

Hakawi stores user uploads (images, PDFs) in S3-compatible object storage (AWS S3 or Cloudflare R2).

### 3.2 Versioning Strategy

- **Bucket Versioning:** Enabled on `hakawi-uploads` bucket
- **Object Lock:** 7-day retention for critical media (legal compliance)
- **Cross-Region Replication:** Enabled for production bucket (optional for cost savings)

### 3.3 Backup Schedule

| Data Type | Frequency | Retention | Destination |
|-----------|-----------|-----------|-------------|
| PostgreSQL full dump | Daily | 30 days | S3 Glacier IR |
| WAL archives | Continuous | 30 days | S3 Standard |
| Valkey RDB | Daily | 14 days | S3 Glacier IR |
| Valkey AOF | Daily | 14 days | S3 Glacier IR |
| Uploads manifest | Daily | 30 days | S3 Standard |
| Application config | On change | Indefinite | Git + S3 |

### 3.4 Uploads Manifest

A daily manifest of all uploaded files is generated and backed up:

```bash
aws s3 ls s3://hakawi-uploads/ --recursive | gzip > /tmp/uploads_manifest_$(date +%Y%m%d).txt.gz
aws s3 cp /tmp/uploads_manifest_*.txt.gz s3://hakawi-backups/uploads/manifests/
```

---

## 4. Backup Schedule

### 4.1 Cron Schedule

```
# PostgreSQL daily backup at 02:00
0 2 * * * /opt/hakawi/scripts/backup-postgres.sh >> /var/log/hakawi/backup-postgres.log 2>&1

# Valkey daily backup at 02:30
30 2 * * * /opt/hakawi/scripts/backup-valkey.sh >> /var/log/hakawi/backup-valkey.log 2>&1

# WAL archiving - continuous via PostgreSQL config

# Weekly full backup verification on Sundays at 04:00
0 4 * * 0 /opt/hakawi/scripts/verify-backup.sh >> /var/log/hakawi/verify-backup.log 2>&1

# Monthly restore test on 1st of month at 05:00
0 5 1 * * /opt/hakawi/scripts/test-restore.sh >> /var/log/hakawi/test-restore.log 2>&1
```

### 4.2 Backup Monitoring

- Monitor backup job exit codes via health checks
- Alert on backup failures (PagerDuty / Slack)
- Daily backup success email report
- Weekly backup size trend analysis

---

## 5. Restore Procedures

### 5.1 PostgreSQL Restore

#### Full Database Restore from pg_dump

```bash
# Stop application
systemctl stop hakawi-backend

# Drop and recreate database
psql -c "DROP DATABASE IF EXISTS hakawi_production;"
psql -c "CREATE DATABASE hakawi_production;"

# Restore from dump
pg_restore -d hakawi_production /path/to/hakawi_20250924_020000.dump

# Or from S3
aws s3 cp s3://hakawi-backups/postgresql/hakawi_20250924_020000.dump - | pg_restore -d hakawi_production

# Run migrations if needed
npm run db:migrate

# Start application
systemctl start hakawi-backend
```

#### Point-in-Time Recovery (PITR) with WAL

```bash
# Restore base backup
pg_restore -C -d postgres /path/to/base_backup.dump

# Configure recovery
echo "recovery_target_time = '2025-09-24 14:30:00'" >> postgresql.conf
echo "restore_command = 'aws s3 cp s3://hakawi-backups/wal/%f %p'" >> postgresql.conf

# Start PostgreSQL in recovery mode
systemctl start postgresql

# Monitor recovery
tail -f /var/log/postgresql/postgresql.log
```

### 5.2 Valkey Restore

```bash
# Stop Valkey
systemctl stop valkey

# Restore RDB
cp /path/to/dump_20250924.rdb /var/lib/valkey/dump.rdb
chown valkey:valkey /var/lib/valkey/dump.rdb

# Restore AOF (if needed)
cp /path/to/aof_20250924.aof /var/lib/valkey/appendonly.aof
chown valkey:valkey /var/lib/valkey/appendonly.aof

# Start Valkey
systemctl start valkey

# Verify data
valkey-cli INFO keyspace
```

### 5.3 File Storage Restore

```bash
# Restore specific file from S3 versioning
aws s3 cp s3://hakawi-uploads/images/abc123.png?versionId=version-id /local/path/

# Bulk restore from manifest
aws s3 cp s3://hakawi-backups/uploads/manifests/uploads_20250924.txt.gz - | \
  gunzip | \
  while read -r line; do
    # Parse and restore each file
    aws s3 cp "s3://hakawi-uploads/$line" /restore/path/
  done
```

---

## 6. Disaster Recovery Plan

### 6.1 Recovery Time Objectives (RTO)

| Component | RTO | RPO |
|-----------|-----|-----|
| Database | 1 hour | 5 minutes |
| Valkey Cache | 15 minutes | 1 minute |
| File Storage | 30 minutes | Near zero |
| Full System | 2 hours | 5 minutes |

### 6.2 Disaster Recovery Tiers

**Tier 1: Single Node Failure**
- Automatic failover via Kubernetes / systemd
- No data loss expected
- RTO: < 5 minutes

**Tier 2: Region Failure**
- Restore from S3 cross-region replication
- Promote read replica in secondary region
- RTO: < 2 hours
- RPO: < 1 hour

**Tier 3: Complete Data Center Failure**
- Restore from S3 + Glacier
- Rebuild infrastructure via Terraform / Ansible
- RTO: < 4 hours
- RPO: < 24 hours (daily backups)

### 6.3 DR Runbook Summary

1. **Assess:** Determine scope of failure (data, compute, network)
2. **Notify:** Alert stakeholders via PagerDuty
3. **Isolate:** Isolate failed components to prevent cascading failures
4. **Restore Data:** Follow restore procedures above
5. **Verify:** Run smoke tests and verify data integrity
6. **Cutover:** Redirect traffic to restored system
7. **Monitor:** Enhanced monitoring for 24 hours post-restore
8. **Post-Mortem:** Document incident and improve DR procedures

### 6.4 Backup Testing Schedule

| Test Type | Frequency | Owner |
|-----------|-----------|-------|
| Backup verification (checksum) | Daily | CI/CD Pipeline |
| Restore to staging | Weekly | DevOps Team |
| PITR drill | Monthly | DBA Team |
| Full DR simulation | Quarterly | Engineering Leads |

### 6.5 Security Considerations

- All backup files encrypted at rest (AES-256)
- Backup access restricted to authorized personnel only
- MFA required for S3 bucket access
- Backup logs retained for 90 days for audit compliance

---

# استراتيجية النسخ الاحتياطي

## نظرة عامة

هذا المستند يحدد استراتيجية النسخ الاحتياطي والتعافي من الكوارث لحاكي. يغطي نسخ قاعدة البيانات الاحتياطية، استمرارية فالكاي، نسخ التخزين الاحتياطي للملفات، جداول النسخ الاحتياطي، إجراءات الاستعادة، والتخطيط للتعافي من الكوارث.

## 1. استراتيجية نسخ قاعدة البيانات الاحتياطية

### 1.1 نهج النسخ الاحتياطي ل PostgreSQL

حاكي يستخدم PostgreSQL كقاعدة بيانات أساسية. تتم عمليات النسخ الاحتياطي باستخدام `pg_dump` للنسخ المنطقية وأرشفة WAL (سجل الكتابة المسبق) للاستعادة في نقطة زمنية محددة.

### 1.2 النسخ الاحتياطي المنطقي لـ pg_dump

- **الأداة:** `pg_dump` بالتنسيق المخصص (`-Fc`)
- **التكرار:** نسخ احتياطي كامل يومي في الساعة 02:00
- **الاستبقاء:** 30 يوم من النسخ الاحتياطية اليومية، 12 نسخة شهرية
- **الضغط:** ضغط gzip بعد التفريغ
- **التخزين:** حاوية S3/R2 `hakawi-backups/postgresql/`

### 1.3 أرشفة WAL

- **الغرض:** تمكين الاستعادة في نقطة زمنية محددة (PITR)
- **التكوين:**
  - `wal_level = replica`
  - `archive_mode = on`
  - `archive_command = 'aws s3 cp %p s3://hakawi-backups/wal/%f'`
  - `archive_timeout = 300` (5 دقائق)
- **الاستبقاء:** ملفات WAL محفوظة لمدة 30 يوم
- **التحقق:** اختبار استعادة شهري للتحقق من سلامة WAL

## 2. استمرارية فالكاي

### 2.1 أوضاع الاستمرارية

فالكاي يستخدم للتخزين المؤقت وإدارة الجلسات. توازن استراتيجية الاستمرارية بين سلامة البيانات والأداء.

### 2.2 لقطات RDB

- **التكوين:**
  - `save 900 1` - حفظ لقطة إذا تم تغيير مفتاح واحد على الأقل في 15 دقيقة
  - `save 300 10` - حفظ لقطة إذا تم تغيير 10 مفاتيح على الأقل في 5 دقائق
  - `save 60 10000` - حفظ لقطة إذا تم تغيير 10000 مفتاح على الأقل في دقيقة واحدة
- **الملف:** `dump.rdb`
- **النسخ الاحتياطي:** نسخة يومية إلى S3/R2 `hakawi-backups/valkey/rdb/`

### 2.3 ملف الإلحاق فقط (AOF)

- **التكوين:**
  - `appendonly yes`
  - `appendfsync everysec` - مزامنة كل ثانية (آمن وسريع)
  - `auto-aof-rewrite-percentage 100`
  - `auto-aof-rewrite-min-size 64mb`
- **الملف:** `appendonly.aof`
- **النسخ الاحتياطي:** نسخة يومية إلى S3/R2 `hakawi-backups/valkey/aof/`

## 3. نسخ التخزين الاحتياطي للملفات

### 3.1 تخزين الكائنات S3 / R2

حاكي يخزن الملفات التي يرفعها المستخدمون (صور، ملفات PDF) في تخزين الكائنات المتوافق مع S3.

### 3.2 استراتيجية الإصدارات

- **إصدارات الدلو:** مفعّلة على دلو `hakawi-uploads`
- **قفل الكائنات:** استبقاء لمدة 7 أيام للوسائط الأساسية
- **التكرار عبر المناطق:** مفعّل لدلو الإنتاج

### 3.3 جدول النسخ الاحتياطي

| نوع البيانات | التكرار | الاستبقاء | الوجهة |
|--------------|---------|-----------|--------|
| تفريغ PostgreSQL كامل | يومي | 30 يوم | S3 Glacier IR |
| أرشيفات WAL | مستمر | 30 يوم | S3 Standard |
| RDB فالكاي | يومي | 14 يوم | S3 Glacier IR |
| AOF فالكاي | يومي | 14 يوم | S3 Glacier IR |
| كشف التحميلات | يومي | 30 يوم | S3 Standard |

## 4. جدول النسخ الاحتياطي

### 4.1 جدول Cron

```
# النسخ الاحتياطي ل PostgreSQL يومي في 02:00
0 2 * * * /opt/hakawi/scripts/backup-postgres.sh >> /var/log/hakawi/backup-postgres.log 2>&1

# النسخ الاحتياطي لفالكاي يومي في 02:30
30 2 * * * /opt/hakawi/scripts/backup-valkey.sh >> /var/log/hakawi/backup-valkey.log 2>&1

# أرشفة WAL - مستمرة عبر تكوين PostgreSQL

# التحقق من النسخ الاحتياطي الكامل أسبوعيًا أيام الأحد في 04:00
0 4 * * 0 /opt/hakawi/scripts/verify-backup.sh >> /var/log/hakawi/verify-backup.log 2>&1

# اختبار الاستعادة الشهري في أول الشهر في 05:00
0 5 1 * * /opt/hakawi/scripts/test-restore.sh >> /var/log/hakawi/test-restore.log 2>&1
```

## 5. إجراءات الاستعادة

### 5.1 استعادة PostgreSQL

```bash
# إيقاف التطبيق
systemctl stop hakawi-backend

# إسقاط وإعادة إنشاء قاعدة البيانات
psql -c "DROP DATABASE IF EXISTS hakawi_production;"
psql -c "CREATE DATABASE hakawi_production;"

# الاستعادة من التفريغ
pg_restore -d hakawi_production /path/to/hakawi_20250924_020000.dump

# بدء التطبيق
systemctl start hakawi-backend
```

### 5.2 استعادة فالكاي

```bash
# إيقاف فالكاي
systemctl stop valkey

# استعادة RDB
cp /path/to/dump_20250924.rdb /var/lib/valkey/dump.rdb
chown valkey:valkey /var/lib/valkey/dump.rdb

# بدء فالكاي
systemctl start valkey

# التحقق من البيانات
valkey-cli INFO keyspace
```

### 5.3 استعادة التخزين الاحتياطي للملفات

```bash
# استعادة ملف معين من إصدارات S3
aws s3 cp s3://hakawi-uploads/images/abc123.png?versionId=version-id /local/path/
```

## 6. خطة التعافي من الكوارث

### 6.1 أهداف وقت التعافي (RTO)

| المكون | RTO | RPO |
|--------|-----|-----|
| قاعدة البيانات | ساعة واحدة | 5 دقائق |
| ذاكرة التخزين المؤقت فالكاي | 15 دقيقة | دقيقة واحدة |
| التخزين الاحتياطي للملفات | 30 دقيقة | شبه صفر |
| النظام الكامل | ساعتان | 5 دقائق |

### 6.2 مستويات التعافي من الكوارث

**المستوى 1: فشل عقدة واحدة**
- تبديل تلقائي عبر Kubernetes / systemd
- لا pérdan للبيانات المتوقعة
- RTO: < 5 دقائق

**المستوى 2: فشل المنطقة**
- الاستعادة من التكرار عبر المناطق في S3
- ترقية النسخة المتماثلة للقراءة في المنطقة الثانوية
- RTO: < ساعتين
- RPO: < ساعة واحدة

**المستوى 3: فشل مركز البيانات بالكامل**
- الاستعادة من S3 + Glacier
- إعادة بناء البنية التحتية عبر Terraform / Ansible
- RTO: < 4 ساعات
- RPO: < 24 ساعة (نسخ احتياطية يومية)
