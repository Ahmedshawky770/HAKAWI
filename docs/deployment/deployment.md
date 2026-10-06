# Deployment Guide

## Overview

This guide explains how to deploy the Hakawi platform to production. The platform consists of:
- Backend: NestJS API
- Frontend: Next.js application
- Database: PostgreSQL 15
- Cache: Valkey 8
- Storage: S3-compatible (R2 recommended)

## Prerequisites

- Docker and Docker Compose
- PostgreSQL 15+ database
- Valkey 8+ instance
- S3-compatible storage bucket
- Domain name with SSL certificate
- GitHub repository with Actions enabled

## Option 1: Docker Compose (Recommended for Small Deployments)

### Step 1: Clone and Configure

```bash
git clone https://github.com/your-org/hakawi.git
cd hakawi
cp .env.example .env
```

Edit `.env` with your production values:

```env
NODE_ENV=production
DATABASE_URL=postgres://postgres:YOUR_PASSWORD@db:5432/hakawi
VALKEY_URL=valkey://valkey:6379
JWT_SECRET=your-production-jwt-secret
ENCRYPTION_KEY=your-production-encryption-key
PAYMOB_API_KEY=your-paymob-api-key
PAYMOB_MERCHANT_ID=your-paymob-merchant-id
PAYMOB_INTEGRATION_ID=your-paymob-integration-id
S3_BUCKET=your-bucket-name
S3_REGION=your-region
S3_ACCESS_KEY=your-access-key
S3_SECRET_KEY=your-secret-key
```

### Step 2: Build and Start

```bash
docker compose up -d postgres valkey
docker compose up -d --build backend frontend
```

### Step 3: Run Migrations

```bash
docker compose exec backend npm run migration:run --workspace=backend
```

### Step 4: Verify

```bash
curl https://your-domain.com/health
```

## Option 2: GitHub Actions Deployment (Recommended for Production)

### Step 1: Configure Secrets

Add these secrets to your GitHub repository:

```
BACKUP_DB_HOST=your-db-host
BACKUP_DB_PORT=5432
BACKUP_DB_USER=postgres
BACKUP_DB_NAME=hakawi
BACKUP_DB_PASSWORD=your-db-password

SLACK_API_URL=https://hooks.slack.com/services/YOUR/WEBHOOK/URL
PAGERDUTY_SERVICE_KEY=your-pagerduty-key
ALERT_EMAIL_RECIPIENTS=team@example.com
ALERT_EMAIL_FROM=alerts@example.com
ALERT_SMTP_HOST=smtp.example.com
ALERT_SMTP_USERNAME=alerts@example.com
ALERT_SMTP_PASSWORD=your-smtp-password

SSH_PRIVATE_KEY=your-deploy-ssh-key
SSH_HOST=your-server.com
SSH_USER=deploy
```

### Step 2: Enable Workflows

The following workflows are configured:

1. **CI/CD Pipeline** (`.github/workflows/ci.yml`)
   - Runs on every push and PR
   - Executes lint, tests, coverage, e2e, browser tests, migration checks, security audit, and build
   - Includes k6 load test on main branch

2. **Deployment** (`.github/workflows/deploy.yml`)
   - Runs on push to main
   - Builds and pushes Docker images to GHCR
   - Tags images with commit SHA and branch name

3. **Automated Backup** (`.github/workflows/backup.yml`)
   - Runs daily at 2 AM UTC
   - Creates timestamped database backup
   - Uploads as GitHub Actions artifact (retained 30 days)

### Step 3: Deploy to Server

```bash
# SSH into your server
ssh deploy@your-server.com

# Pull the latest images
docker compose pull

# Start services
docker compose up -d postgres valkey
docker compose up -d --build backend frontend

# Run migrations
docker compose exec backend npm run migration:run --workspace=backend

# Verify
curl http://localhost:3000/health
```

## Option 3: Kubernetes

### Step 1: Create Namespace

```bash
kubectl create namespace hakawi
```

### Step 2: Deploy Database

```bash
kubectl apply -f k8s/postgres.yaml
kubectl apply -f k8s/valkey.yaml
```

### Step 3: Deploy Application

```bash
kubectl apply -f k8s/backend.yaml
kubectl apply -f k8s/frontend.yaml
kubectl apply -f k8s/ingress.yaml
```

### Step 4: Run Migrations

```bash
kubectl exec -it deployment/backend -- npm run migration:run --workspace=backend
```

## Environment Variables

### Backend

| Variable | Required | Description |
|----------|----------|-------------|
| `NODE_ENV` | Yes | `production` for production |
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `VALKEY_URL` | Yes | Valkey/Redis connection string |
| `JWT_SECRET` | Yes | JWT signing secret (min 32 chars) |
| `ENCRYPTION_KEY` | Yes | Encryption key (32 bytes, hex) |
| `PAYMOB_API_KEY` | Yes | Paymob API key |
| `PAYMOB_MERCHANT_ID` | Yes | Paymob merchant ID |
| `PAYMOB_INTEGRATION_ID` | Yes | Paymob integration ID |
| `S3_BUCKET` | Yes | S3 bucket name |
| `S3_REGION` | Yes | S3 region |
| `S3_ACCESS_KEY` | Yes | S3 access key |
| `S3_SECRET_KEY` | Yes | S3 secret key |
| `SENTRY_DSN` | No | Sentry DSN for error tracking |
| `EMAIL_FROM` | No | From address for emails |

### Frontend

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_API_URL` | Yes | Backend API URL |
| `NEXT_PUBLIC_SENTRY_DSN` | No | Sentry DSN |

## Health Checks

### Backend

```bash
# Health check
curl https://your-domain.com/health

# Expected response
{
  "status": "healthy",
  "database": "connected",
  "valkey": "connected"
}

# Metrics
curl https://your-domain.com/metrics/cache
```

### Frontend

```bash
# Health check
curl https://your-domain.com/api/health
```

## Monitoring

### Metrics

The application exposes metrics at:
- Backend: `GET /metrics/cache` (cache hit rate)
- Backend: `GET /metrics/degradation` (circuit breaker status)

### Logs

Logs are structured JSON via Winston. Configure your log aggregator to parse:
- `level`: log level
- `message`: log message
- `correlationId`: request correlation ID
- `context`: additional context

### Alerting

Alert rules are defined in `monitoring/alert-rules.yml`. To deploy:

1. Configure Alertmanager (see `docs/deployment/alerting.md`)
2. Deploy Prometheus with alert rules
3. Configure notification channels (Slack, email, PagerDuty)
4. Test alerts with `curl -X POST http://localhost:9093/api/v1/alerts`

## Backup Strategy

### Automated Backups

Backups run daily at 2 AM UTC via GitHub Actions (`.github/workflows/backup.yml`):

1. Creates timestamped PostgreSQL dump
2. Compresses with gzip
3. Uploads as GitHub Actions artifact (30-day retention)
4. Rotates old backups

### Manual Backups

```bash
# Create a manual backup
./scripts/backup.sh ./backups

# Restore from backup
gunzip -c backups/hakawi-20260101-020000.sql.gz | psql -U postgres -d hakawi
```

## Rollback

### Docker Compose

```bash
# Rollback to previous image
docker compose up -d --force-recreate backend frontend

# Run migrations if needed
docker compose exec backend npm run migration:rollback --workspace=backend
```

### Kubernetes

```bash
# Rollback deployment
kubectl rollout undo deployment/backend
kubectl rollout undo deployment/frontend

# Check status
kubectl rollout status deployment/backend
```

## Security

### Checklist

- [ ] All secrets stored in GitHub Secrets or environment variables
- [ ] HTTPS enabled with valid SSL certificate
- [ ] Database not exposed to public internet
- [ ] Valkey password protected
- [ ] S3 bucket not public
- [ ] Firewall rules configured
- [ ] Rate limiting enabled
- [ ] WAF rules active
- [ ] Error tracking enabled (Sentry)
- [ ] Backup encryption enabled

### SSL/TLS

Use Let's Encrypt with Certbot:

```bash
certbot --nginx -d your-domain.com
```

## Troubleshooting

### Backend won't start

```bash
# Check logs
docker compose logs backend

# Common issues:
# - Missing environment variables
# - Database not ready
# - Migration failed
```

### Database connection issues

```bash
# Test connection
docker compose exec backend npm run migration:status --workspace=backend

# Check PostgreSQL
docker compose exec postgres pg_isready -U postgres
```

### Frontend build fails

```bash
# Clear cache
rm -rf frontend/.next
npm run build --workspace=frontend
```

## Performance

### Recommended Resources

| Service | CPU | Memory | Storage |
|---------|-----|--------|---------|
| Backend | 2 cores | 4 GB | 20 GB |
| Frontend | 1 core | 2 GB | 10 GB |
| PostgreSQL | 2 cores | 4 GB | 50 GB |
| Valkey | 1 core | 2 GB | 10 GB |

### Optimization

- Enable CDN for static assets
- Configure database connection pooling
- Enable Valkey persistence (AOF + RDB)
- Use read replicas for read-heavy workloads
- Enable gzip compression
