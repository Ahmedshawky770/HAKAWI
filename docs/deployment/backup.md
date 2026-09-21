# Backup & Recovery
## Hakawi - Data Protection and Disaster Recovery

---

## Backup Strategy

### Backup Types

| Type | Frequency | Retention | Purpose |
|------|-----------|-----------|---------|
| **Database** | Daily | 30 days | Point-in-time recovery |
| **Files** | Daily | 30 days | Media files recovery |
| **Configuration** | On change | 1 year | Disaster recovery |
| **Secrets** | On change | 1 year | Credential recovery |

---

## Database Backups

### Automated Backups

```sql
-- Daily full backup
pg_dump -h localhost -U postgres hakawi > backup_$(date +%Y%m%d).sql

-- Compressed backup
pg_dump -h localhost -U postgres hakawi | gzip > backup_$(date +%Y%m%d).sql.gz
```

### Backup Schedule

```
Daily:   Full backup at 2:00 AM UTC
Weekly:  Full backup on Sunday at 2:00 AM UTC
Monthly: Full backup on 1st of month at 2:00 AM UTC
```

### Retention Policy

- **Daily backups:** Keep for 30 days
- **Weekly backups:** Keep for 90 days
- **Monthly backups:** Keep for 1 year

### Point-in-Time Recovery (PITR)

```sql
-- Restore to specific point in time
pg_restore -h localhost -U postgres -d hakawi_restore backup.dump

-- Or use WAL archiving for PITR
archive_command = 'cp %p /var/lib/postgresql/wal_archive/%f'
```

---

## File Backups

### Media Files

```bash
# Backup media files
tar -czf media_backup_$(date +%Y%m%d).tar.gz /path/to/media

# Upload to S3/R2
aws s3 cp media_backup_$(date +%Y%m%d).tar.gz s3://hakawi-backups/media/
```

### Backup Schedule

- **Daily:** Incremental backup of new files
- **Weekly:** Full backup of all files

---

## Configuration Backups

### What to Backup

```
├── docker-compose.yml
├── nginx.conf
├── .env.production (encrypted)
├── SSL certificates
└── Deployment scripts
```

### How to Backup

```bash
# Encrypt and backup configuration
tar -czf config_backup.tar.gz docker-compose.yml nginx.conf scripts/
gpg --encrypt --recipient admin@hakawi.com config_backup.tar.gz
```

---

## Recovery Procedures

### Database Recovery

#### Full Restore

```bash
# 1. Stop application
docker-compose down

# 2. Restore database
psql -h localhost -U postgres hakawi < backup_latest.sql

# 3. Run migrations
npm run migration:run

# 4. Start application
docker-compose up -d
```

#### Point-in-Time Recovery

```bash
# 1. Stop application
docker-compose down

# 2. Restore base backup
psql -h localhost -U postgres hakawi < backup_base.sql

# 3. Apply WAL logs
pg_waldump /var/lib/postgresql/wal_archive/ | psql -h localhost -U postgres hakawi

# 4. Start application
docker-compose up -d
```

### File Recovery

```bash
# Restore media files
aws s3 cp s3://hakawi-backups/media/media_backup_latest.tar.gz .
tar -xzf media_backup_latest.tar.gz -C /path/to/media
```

---

## Disaster Recovery Plan

### RTO (Recovery Time Objective)

- **Database:** 1 hour
- **Files:** 2 hours
- **Full system:** 4 hours

### RPO (Recovery Point Objective)

- **Database:** 24 hours (daily backups)
- **Files:** 24 hours (daily backups)
- **Configuration:** Real-time (version controlled)

### Disaster Scenarios

#### Scenario 1: Database Failure

1. Detect failure (monitoring alert)
2. Notify team
3. Restore from latest backup
4. Verify data integrity
5. Resume operations

**Estimated time:** 1-2 hours

#### Scenario 2: Data Corruption

1. Detect corruption (data validation)
2. Stop writes to database
3. Restore from last known good backup
4. Apply transactions from backup to corruption point
5. Verify data integrity
6. Resume operations

**Estimated time:** 2-4 hours

#### Scenario 3: Complete System Failure

1. Detect failure (health checks)
2. Notify team
3. Provision new infrastructure
4. Restore database from backup
5. Restore files from backup
6. Deploy application code
7. Verify all systems
8. Resume operations

**Estimated time:** 4-6 hours

---

## Backup Verification

### Regular Tests

- **Weekly:** Verify backup can be restored
- **Monthly:** Full disaster recovery drill
- **Quarterly:** Review backup strategy

### Verification Steps

```bash
# 1. Create test database
createdb hakawi_test

# 2. Restore backup
psql -h localhost -U postgres hakawi_test < backup_latest.sql

# 3. Run tests
npm run test:db

# 4. Verify data
npm run db:verify

# 5. Clean up
dropdb hakawi_test
```

---

## Monitoring

### Backup Monitoring

- **Daily backup success rate:** 100%
- **Backup size:** Track growth
- **Backup duration:** Alert if > 1 hour

### Alerts

- Backup failed
- Backup size anomaly
- Disk space < 20%
- Restore test failed

---

## Security

### Backup Encryption

```bash
# Encrypt backup
gpg --encrypt --recipient admin@hakawi.com backup.sql

# Decrypt backup
gpg --decrypt backup.sql.gpg > backup.sql
```

### Access Control

- Only authorized personnel can access backups
- Use SSH keys for backup access
- Log all backup access

### Retention

- Delete old backups automatically
- Follow data retention policies
- Comply with GDPR/data protection laws

---

## Tools

### Database Backup

- **pg_dump** — PostgreSQL backup tool
- **pg_restore** — PostgreSQL restore tool
- **pg_waldump** — WAL log analysis

### File Backup

- **AWS CLI** — S3/R2 upload/download
- **tar/gzip** — Compression

### Monitoring

- **Cron jobs** — Scheduled backups
- **Health checks** — Verify backups
- **Alerts** — Notify on failure

---

## Contacts

### On-Call Team

- **Primary:** [Team lead contact]
- **Secondary:** [Backup contact]

### Escalation

1. On-call engineer
2. Team lead
3. Engineering manager
4. CTO

---

## Runbook

### Quick Recovery Steps

```bash
# 1. Stop application
docker-compose down

# 2. Restore database
psql -U postgres hakawi < /backups/latest.sql

# 3. Restore files
aws s3 cp s3://hakawi-backups/media/latest.tar.gz .
tar -xzf latest.tar.gz -C /app/media

# 4. Start application
docker-compose up -d

# 5. Verify
curl https://api.hakawi.com/health
```

---

*This document defines the backup and recovery procedures for Hakawi.*
