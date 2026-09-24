# Deployment Runbooks

## Overview

This document provides operational runbooks for deploying, rolling back, and responding to incidents in Hakawi. Follow these procedures during deployments and emergency situations.

---

## 1. Deployment Runbook

### 1.1 Pre-Deployment Checklist

- [ ] All tests pass: `npm run test:integration`
- [ ] Lint passes: `npm run lint`
- [ ] TypeScript compiles: `npm run typecheck`
- [ ] Database migrations are up to date: `npm run db:generate`
- [ ] `CHANGELOG.md` updated with release notes
- [ ] Backup completed successfully (see `backup-strategy.md`)
- [ ] Staging deployment verified
- [ ] Rollback plan reviewed

### 1.2 Deployment Steps

#### Step 1: Pull Latest Code

```bash
cd /opt/hakawi/backend
git pull origin main
git checkout <release-branch-or-tag>
```

#### Step 2: Install Dependencies

```bash
npm ci --production
```

#### Step 3: Run Database Migrations

```bash
npm run db:push
# or for production-safe migrations
npm run db:migrate
```

#### Step 4: Build Application

```bash
npm run build
```

#### Step 5: Restart Application

```bash
# Using systemd
sudo systemctl restart hakawi-backend

# Or using PM2
pm2 restart hakawi-backend --update-env

# Or using Docker
docker compose up -d --force-recreate backend
```

#### Step 6: Verify Deployment

```bash
# Health check
curl -f https://api.hakawi.app/api/v1/health

# Smoke test
curl -X POST https://api.hakawi.app/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@hakawi.app","password":"test"}'

# Check logs
journalctl -u hakawi-backend -f --since "5 minutes ago"
```

#### Step 1: Pull Latest Code

```bash
cd /opt/hakawi/backend
git pull origin main
git checkout <release-branch-or-tag>
```

#### Step 2: Install Dependencies

```bash
npm ci --production
```

#### Step 3: Run Database Migrations

```bash
npm run db:push
# or for production-safe migrations
npm run db:migrate
```

#### Step 4: Build Application

```bash
npm run build
```

#### Step 5: Restart Application

```bash
# Using systemd
sudo systemctl restart hakawi-backend

# Or using PM2
pm2 restart hakawi-backend --update-env

# Or using Docker
docker compose up -d --force-recreate backend
```

#### Step 6: Verify Deployment

```bash
# Health check
curl -f https://api.hakawi.app/api/v1/health

# Smoke test
curl -X POST https://api.hakawi.app/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@hakawi.app","password":"test"}'

# Check logs
journalctl -u hakawi-backend -f --since "5 minutes ago"
```

### 1.3 Deployment Verification

After deployment, verify:

| Check | Command | Expected |
|-------|---------|----------|
| Process running | `systemctl status hakawi-backend` | active (running) |
| Port listening | `ss -tlnp | grep 3001` | LISTEN on :3001 |
| Health endpoint | `curl https://api.hakawi.app/api/v1/health` | 200 OK |
| Error rate | Monitor Sentry / Grafana | < 1% |
| Response time | Monitor Grafana | < 500ms p95 |

---

## 2. Rollback Procedure

### 2.1 When to Rollback

- Error rate exceeds 5%
- Critical functionality broken
- Database migration failure
- Security vulnerability introduced
- Performance degradation > 50%

### 2.2 Quick Rollback (Last Known Good)

```bash
# Option 1: Rollback to previous Git commit
cd /opt/hakawi/backend
git revert HEAD
git push origin main
npm ci --production
npm run db:migrate
npm run build
sudo systemctl restart hakawi-backend

# Option 2: Rollback to previous Docker image
docker compose up -d --force-recreate --image=hakawi-backend:previous

# Option 3: Rollback with PM2
pm2 revert hakawi-backend
```

### 2.3 Database Rollback

If migration caused issues:

```bash
# Restore from latest backup
pg_restore -d hakawi_production /backups/latest.dump

# Or perform PITR to time before migration
# Follow PITR procedure in backup-strategy.md
```

### 2.4 Rollback Verification

```bash
# Verify rollback success
curl -f https://api.hakawi.app/api/v1/health
curl https://api.hakawi.app/api/v1/stories

# Check error rate has decreased
# Check Sentry for new errors
```

### 2.5 Communication

- Post rollback status to #incidents Slack channel
- Update status page if customer-facing
- Schedule post-mortem within 24 hours

---

## 3. Incident Response

### 3.1 Incident Severity Levels

| Severity | Description | Response Time | Examples |
|----------|-------------|---------------|----------|
| P0 - Critical | Complete service outage | 15 minutes | DB down, 5xx for all requests |
| P1 - High | Major feature broken | 30 minutes | Auth down, payments failing |
| P2 - Medium | Minor feature broken | 2 hours | Search slow, notifications delayed |
| P3 - Low | Cosmetic issue | 24 hours | UI bug, missing translation |

### 3.2 Incident Response Process

#### Step 1: Detect

- Automated alerts from monitoring (Sentry, Grafana, Datadog)
- User reports via support or social media
- Health check failures

#### Step 2: Acknowledge

```bash
# Acknowledge alert in PagerDuty
# Post in #incidents: "Investigating [issue]"

# Gather initial information
curl https://api.hakawi.app/api/v1/health
journalctl -u hakawi-backend --since "10 minutes ago" | tail -100
```

#### Step 3: Assess

```bash
# Check application logs
journalctl -u hakawi-backend -f

# Check database connectivity
psql -h localhost -U hakawi -c "SELECT 1"

# Check Valkey connectivity
valkey-cli ping

# Check error rates
# Sentry: https://sentry.io/organizations/hakawi/issues/
# Grafana: https://grafana.hakawi.app/d/hakawi-overview

# Check recent deployments
git log --oneline -5
```

#### Step 4: Mitigate

```bash
# Immediate mitigations:

# 1. Restart application (resolves transient issues)
sudo systemctl restart hakawi-backend

# 2. Scale up if overloaded
docker compose up -d --scale backend=3

# 3. Enable maintenance mode if needed
curl -X POST https://api.hakawi.app/api/v1/admin/maintenance \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"enabled": true, "message": "Scheduled maintenance"}'

# 4. Rollback if recent deployment caused issue
# See Rollback Procedure above
```

#### Step 5: Resolve

- Identify root cause
- Implement fix
- Deploy fix to production
- Verify fix resolves issue

#### Step 6: Review

- Post incident report within 48 hours
- Update runbooks based on lessons learned
- Schedule follow-up actions

### 3.3 Common Incidents and Quick Fixes

#### High Error Rate (5xx)

```bash
# Check if process is running
systemctl status hakawi-backend

# Check recent crashes
journalctl -u hakawi-backend --since "30 minutes ago" | grep -i error

# Quick fix: restart
sudo systemctl restart hakawi-backend

# If persists, check database
pg_isready -h localhost
psql -h localhost -U hakawi -c "SELECT 1"
```

#### Database Connection Issues

```bash
# Check PostgreSQL status
systemctl status postgresql

# Check connection pool exhaustion
psql -h localhost -U hakawi -c "SELECT count(*) FROM pg_stat_activity WHERE datname = 'hakawi_production';"

# Restart if needed
sudo systemctl restart postgresql
```

#### High Memory Usage

```bash
# Check memory usage
free -h
ps aux --sort=-%mem | head -10

# Restart if memory leak suspected
sudo systemctl restart hakawi-backend
```

#### Valkey Down

```bash
# Check Valkey status
systemctl status valkey

# Restart Valkey
sudo systemctl restart valkey

# Verify
valkey-cli ping
```

---

## 4. Monitoring Setup

### 4.1 Application Monitoring

#### Health Endpoint

```
GET /api/v1/health
```

Response:
```json
{
  "status": "ok",
  "timestamp": "2025-09-24T18:00:00Z",
  "version": "1.0.0",
  "checks": {
    "database": "healthy",
    "valkey": "healthy",
    "s3": "healthy"
  }
}
```

#### Key Metrics

| Metric | Alert Threshold | Dashboard |
|--------|-----------------|-----------|
| Request rate | < 1 req/min | Grafana |
| Error rate (5xx) | > 1% | Grafana |
| Response time (p95) | > 1000ms | Grafana |
| Database connections | > 80% of pool | Grafana |
| Valkey memory usage | > 80% of max | Grafana |
| Disk usage | > 85% | Grafana |
| CPU usage | > 80% | Grafana |

### 4.2 Logging

- **Application Logs:** Winston logger → stdout → journald / ELK
- **Access Logs:** Nginx / load balancer logs
- **Database Logs:** PostgreSQL log directory
- **Log Retention:** 30 days in ELK, 90 days in S3 Glacier

### 4.3 Alerting

#### PagerDuty Integration

- P0/P1 alerts → Immediate page
- P2 alerts → Slack notification, email next business day
- P3 alerts → Email only

#### Alert Channels

| Channel | Purpose |
|---------|---------|
| #incidents | Active incident coordination |
| #alerts | Automated alert notifications |
| #deployments | Deployment notifications |
| Email | Daily summary, weekly reports |

### 4.4 Monitoring Stack

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────┐
│  Application    │────▶│   Prometheus     │────▶│  Grafana    │
│  (Winston Logs) │     │  (metrics)       │     │  (dashboards)│
└─────────────────┘     └──────────────────┘     └─────────────┘
         │                       │                        │
         ▼                       ▼                        ▼
┌─────────────────┐     ┌──────────────────┐     ┌─────────────┐
│  Loki / ELK     │     │   AlertManager   │     │  Sentry     │
│  (logs)         │     │   (alerts)       │     │  (errors)   │
└─────────────────┘     └──────────────────┘     └─────────────┘
```

### 4.5 Dashboards

1. **Hakawi Overview** - Request rate, error rate, latency, system resources
2. **Database** - Connection pool, query performance, replication lag
3. **Valkey** - Memory usage, hit rate, connected clients
4. **Business Metrics** - Active users, stories created, payments processed
5. **Infrastructure** - CPU, memory, disk, network per host

### 4.6 Synthetic Monitoring

- UptimeRobot / Pingdom for HTTP endpoint monitoring
- Run from multiple geographic regions
- Alert if any region fails for 2 consecutive checks
- Check frequency: 1 minute

---

# كتب تشغيل النشر

## 1. كتيب النشر

### 1.1 قائمة ما قبل النشر

- [ ] جميع الاختبارات نجحت: `npm run test:integration`
- [ ] فحص الأكواد نجح: `npm run lint`
- [ ] TypeScript يترجم بنجاح: `npm run typecheck`
- [ ] ترحيلات قاعدة البيانات محدثة: `npm run db:generate`
- [ ] تم تحديث `CHANGELOG.md` مع ملاحظات الإصدار
- [ ] اكتمل النسخ الاحتياطي بنجاح (انظر `backup-strategy.md`)
- [ ] تم التحقق من النشر على بيئة الاختبار
- [ ] تم مراجعة خطة التراجع

### 1.2 خطوات النشر

#### الخطوة 1: سحب الكود الأخير

```bash
cd /opt/hakawi/backend
git pull origin main
git checkout <release-branch-or-tag>
```

#### الخطوة 2: تثبيت التبعيات

```bash
npm ci --production
```

#### الخطوة 3: تشغيل ترحيلات قاعدة البيانات

```bash
npm run db:push
# أو للترحيلات الآمنة للإنتاج
npm run db:migrate
```

#### الخطوة 4: بناء التطبيق

```bash
npm run build
```

#### الخطوة 5: إعادة تشغيل التطبيق

```bash
# باستخدام systemd
sudo systemctl restart hakawi-backend

# أو باستخدام PM2
pm2 restart hakawi-backend --update-env

# أو باستخدام Docker
docker compose up -d --force-recreate backend
```

#### الخطوة 6: التحقق من النشر

```bash
# فحص الصحة
curl -f https://api.hakawi.app/api/v1/health

# اختبار الدخان
curl -X POST https://api.hakawi.app/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@hakawi.app","password":"test"}'

# فحص السجلات
journalctl -u hakawi-backend -f --since "5 minutes ago"
```

## 2. إجراء التراجع

### 2.1 متى التراجع

- معدل الأخطاء يتجاوز 5%
- وظيفة أساسية مكسورة
- فشل ترحيل قاعدة البيانات
- ثغرة أمنية تم إدخالها
- تدهور الأداء > 50%

### 2.2 تراجع سريع

```bash
# الخيار 1: التراجع إلى الت commit السابق المعروف
cd /opt/hakawi/backend
git revert HEAD
git push origin main
npm ci --production
npm run db:migrate
npm run build
sudo systemctl restart hakawi-backend
```

## 3. استجابة للحوادث

### 3.1 مستويات خطورة الحادث

| الخطورة | الوصف | وقت الاستجابة | أمثلة |
|---------|-------|---------------|--------|
| P0 - حرج | انقطاع كامل للخدمة | 15 دقيقة | قاعدة البيانات معطلة، أخطاء 5xx لجميع الطلبات |
| P1 - مرتفع | وظيفة رئيسية مكسورة | 30 دقيقة | المصادقة معطلة، المدفوعات تفشل |
| P2 - متوسط | وظيفة ثانوية مكسورة | ساعتان | البحث بطيء، الإشعارات متأخرة |
| P3 - منخفض | مشكلة تجميلية | 24 ساعة | خطأ في الواجهة، ترجمة مفقودة |

## 4. إعداد المراقبة

### 4.1 مراقبة التطبيق

| المقياس | حد التنبيه | لوحة التحكم |
|--------|-----------|-------------|
| معدل الطلبات | < 1 طلب/دقيقة | Grafana |
| معدل الأخطاء (5xx) | > 1% | Grafana |
| وقت الاستجابة (p95) | > 1000 مللي ثانية | Grafana |
| اتصالات قاعدة البيانات | > 80% من التجمع | Grafana |
| استخدام ذاكرة فالكاي | > 80% من الحد الأقصى | Grafana |
| استخدام القرص | > 85% | Grafana |
| استخدام وحدة المعالجة المركزية | > 80% | Grafana |

### 4.2 التسجيل

- **سجلات التطبيق:** Winston → stdout → journald / ELK
- **سجلات الوصول:** سجلات Nginx / موازن التحميل
- **سجلات قاعدة البيانات:** دليل سجلات PostgreSQL
- **استبقاء السجلات:** 30 يوم في ELK، 90 يوم في S3 Glacier

### 4.3 التنبيهات

| القناة | الغرض |
|--------|-------|
| #incidents | تنسيق الحادث النشط |
| #alerts | إشعارات التنبيه الآلية |
| #deployments | إشعارات النشر |
| البريد الإلكتروني | ملخص يومي، تقارير أسبوعية |

### 4.4 لوحات التحكم

1. **نظرة عامة على حاكي** - معدل الطلبات، معدل الأخطاء، الكمون، موارد النظام
2. **قاعدة البيانات** - تجمع الاتصالات، أداء الاستعلام، تأخر النسخ المتماثل
3. **فالكاي** - استخدام الذاكرة، معدل الإصابة، العملاء المتصلون
4. **مقاييس الأعمال** - المستخدمون النشطون، القصص المنشأة، المدفوعات المعالجة
5. **البنية التحتية** - وحدة المعالجة المركزية، الذاكرة، القرص، الشبكة لكل مضيف

### 4.5 المراقبة التركيبية

- UptimeRobot / Pingdom لمراقبة نقاط نهاية HTTP
- التشغيل من مناطق جغرافية متعددة
- تنبيه إذا فشلت أي منطقة لفحصين متتاليين
- تكرار الفحص: دقيقة واحدة
