# Deployment Guide

## Overview

This guide explains how to deploy the Hakawi platform to production. The platform consists of:
- Backend: NestJS API (3-5 replicas)
- Frontend: Next.js application (3-5 replicas)
- Database: AWS RDS PostgreSQL 15 (Primary + Read Replicas in Multi-AZ)
- Cache: AWS ElastiCache Valkey 8 (with encryption and replication)
- Storage: AWS S3 (with CloudFront CDN and OAI)
- Load Balancing: AWS Application Load Balancer (via Ingress)
- Container Orchestration: AWS EKS (Kubernetes 1.28)
- Infrastructure as Code: Terraform (AWS + Kubernetes)
- Secrets Management: AWS Secrets Manager + External Secrets Operator
- Monitoring: Prometheus/Grafana stack via Helm

## Deployment Options

| Option | Use Case | Infrastructure |
|--------|----------|----------------|
| **Kubernetes (Recommended)** | Production, staging | EKS, RDS, ElastiCache, S3 managed by Terraform |
| **Docker Compose** | Local development, small deployments | Self-managed on a single host |
| **Kubernetes (Manual)** | Self-managed Kubernetes | Bring your own cluster |

## Architecture (Principle #9 — Single Source of Truth) — Kubernetes

```
┌─────────────────────────────────────────────────────────────────────┐
│                          VPC (10.0.0.0/16)                        │
│                                                                     │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐            │
│  │ AZ A (a)    │    │ AZ B (b)    │    │ AZ C (c)    │            │
│  │             │    │             │    │             │            │
│  │ RDS Primary │    │ RDS Replica │    │ RDS Replica │            │
│  │ (r6g.xlarge)│    │ (r6g.xlarge)│    │ (r6g.xlarge)│            │
│  │             │    │             │    │             │            │
│  │ EKS Nodes   │    │ EKS Nodes   │    │ EKS Nodes   │            │
│  │ (m6i.xlarge)│    │ (m6i.xlarge)│    │ (m6i.xlarge)│            │
│  └─────────────┘    └─────────────┘    └─────────────┘            │
│                                                                     │
│  VPC Endpoints: S3, ECR, CloudWatch, STS                           │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                          Ingress (ALB)                             │
│                                                                     │
│  api.hakawi.io                     app.hakawi.io                    │
│  (backend)                         (frontend)                       │
└────────────────────────┬───────────────────────────────┬──────────┘
                         │                               │
                         ▼                               ▼
┌─────────────────────────────────┐  ┌───────────────────────────────┐
│ Namespace: hakawi               │  │ Namespace: monitoring          │
│                                 │  │                               │
│  Backend (3-5 pods)             │  │  Prometheus                   │
│  Frontend (3-5 pods)            │  │  Grafana                      │
│  Secrets (ExternalSecrets)      │  │  Alertmanager                  │
│                                 │  │                               │
│  HPA + PDB enabled              │  │  S3 Backup Bucket              │
│  Topology spread                │  │                               │
└─────────────────────────────────┘  └───────────────────────────────┘

External Services:
  - S3 (Media, with CloudFront OAI)
  - Route 53 (DNS)
  - ACM (TLS Certificates)
  - WAF (Web Application Firewall)
  - Secrets Manager (credentials)

Secrets Injection:
  External Secrets Operator reads from AWS Secrets Manager
  and creates/ updates Kubernetes Secret objects.
```

**Routing Logic (Application Layer):**
- **Writes** (INSERT/UPDATE/DELETE) → Primary PostgreSQL via RDS Proxy
- **Reads** (SELECT) → Read replicas when `DB_REPLICA_HOSTS` is set
- **Post-write reads** → Primary (read-your-writes consistency)

## Prerequisites

### For Kubernetes Deployment (Production)

- AWS CLI configured with deployment credentials
- `kubectl`, `helm`, and `kustomize` v5+ installed
- `terraform` v1.9+ installed
- IAM permissions for EKS, RDS, S3, and Secrets Manager

### For Docker Compose (Development)

- Docker and Docker Compose
- PostgreSQL 15+ (Primary + 1-2 Replicas)
- Valkey 8+ instance
- S3-compatible storage bucket

## Option 1: Kubernetes (Recommended for Production)

### Step 1: Provision Infrastructure with Terraform

```bash
# Initialize Terraform (backend state, provider plugins)
cd infrastructure/terraform
./../scripts/tf-init.sh production

# Review the plan
terraform plan -var-file=environments/production/terraform.tfvars

# Apply infrastructure (creates VPC, RDS, EKS, S3, Secrets Manager entries)
terraform apply -var-file=environments/production/terraform.tfvars -auto-approve
```

This provisions:
- VPC with public/private/database subnets across 3 AZs
- RDS PostgreSQL cluster (primary + 2 read replicas)
- ElastiCache Valkey 8 replication group
- S3 media bucket with CloudFront CDN
- EKS cluster with managed node groups
- IAM roles (IRSA) for each service
- Secrets Manager entries for all credentials

### Step 2: Configure kubeconfig

```bash
aws eks update-kubeconfig --name hakawi-production-eks --alias production
kubectl config use-context production
```

### Step 3: Populate Secrets Manager

```bash
# Store credentials in AWS Secrets Manager
aws secretsmanager create-secret --name "hakawi/production/db/host" --secret-string "hakawi-production.cluster-xxxxxxxx.rds.amazonaws.com"
aws secretsmanager create-secret --name "hakawi/production/db/user" --secret-string "hakawi_user"
aws secretsmanager create-secret --name "hakawi/production/db/password" --secret-string "your-strong-password" --kms-key-id alias/aws/secretsmanager
aws secretsmanager create-secret --name "hakawi/production/jwt/secret" --secret-string "$(openssl rand -hex 32)"
aws secretsmanager create-secret --name "hakawi/production/encryption/key" --secret-string "$(openssl rand -hex 32)"
```

### Step 4: Deploy to Cluster with Helm

```bash
# Deploy backend
helm upgrade --install hakawi-backend ./infrastructure/helm/backend \
  --namespace hakawi \
  --values infrastructure/kubernetes/overlays/production/backend-values.yaml \
  --set image.tag=v1.0.0 \
  --wait --timeout=600s

# Deploy frontend
helm upgrade --install hakawi-frontend ./infrastructure/helm/frontend \
  --namespace hakawi \
  --values infrastructure/kubernetes/overlays/production/frontend-values.yaml \
  --set image.tag=v1.0.0 \
  --wait --timeout=600s

# Alternatively, use Kustomize
kustomize build infrastructure/kubernetes/overlays/production | kubectl apply -f -
```

### Step 5: Run Database Migrations

```bash
kubectl exec -it deploy/hakawi-production-backend -n hakawi \
  -- npx drizzle-kit migrate --config=./backend/drizzle.config.ts
```

### Step 6: Verify

```bash
kubectl get pods,svc,ingress,hpa -n hakawi

# Health checks
kubectl exec -n hakawi deploy/hakawi-production-backend -- curl -s http://localhost:3001/health
curl https://api.hakawi.io/health
curl https://app.hakawi.io/
```

### Step 7: Rollback (if needed)

```bash
helm rollback hakawi-backend -n hakawi

# Or with kubectl
kubectl rollout undo deployment/hakawi-production-backend -n hakawi
kubectl rollout status deployment/hakawi-production-backend -n hakawi --timeout=300s
```

## Option 2: CI/CD Automated Deployment (Recommended for Production)

### Step 1: Configure AWS Credentials

Set up OIDC authentication between GitHub and AWS once:

```bash
./infrastructure/scripts/setup-iam.sh
```

Add the role ARN to your GitHub repository secrets as `AWS_ROLE_ARN`.

### Step 2: Deploy Environments

The following GitHub Actions workflows automate deployment:

| Workflow | Trigger | Description |
|----------|---------|-------------|
| `deploy-dev.yml` | Push to `develop` | Deploys to dev EKS cluster |
| `deploy-staging.yml` | Push to `main` | Deploys to staging EKS cluster |
| `deploy-production.yml` | Push to `main` / manual | Deploys to production EKS cluster |
| `terraform.yml` | Changes to `infrastructure/terraform/` | Runs `terraform fmt`, `validate`, `tflint`, `tfsec`, and `plan` |

```bash
# Manual trigger for production (requires approval)
gh workflow run deploy-production.yml --ref main

# Deploy a specific environment manually
./infrastructure/scripts/deploy.sh staging deploy
./infrastructure/scripts/deploy.sh production deploy
```

### Prerequisites

- EKS cluster with `helm` and `kubectl` configured
- AWS credentials for image pulls and secret management

### Step 1: Deploy with Helm Charts

Both backend and frontend have Helm charts under `infrastructure/helm/`:

```bash
# Backend
helm upgrade --install hakawi-backend infrastructure/helm/backend \
  --namespace hakawi \
  --set image.tag=v1.0.0 \
  --set env.db.host=hakawi-cluster.cluster-xxxxxxxx.rds.amazonaws.com \
  --set env.valkey.host=hakawi.xxxxxx.cache.amazonaws.com \
  --set env.s3.bucket=hakawi-media \
  --wait --timeout=300s

# Frontend
helm upgrade --install hakawi-frontend infrastructure/helm/frontend \
  --namespace hakawi \
  --set image.tag=v1.0.0 \
  --wait --timeout=300s
```

### Step 2: Deploy with Kustomize

```bash
kustomize build infrastructure/kubernetes/overlays/staging | kubectl apply -f -
kustomize build infrastructure/kubernetes/overlays/production | kubectl apply -f -
```

### Step 3: Run Migrations

```bash
kubectl exec -it deploy/hakawi-backend -n hakawi -- npx drizzle-kit migrate
```

## Environment Variables

### Backend

| Variable | Required | Description |
|----------|----------|-------------|
| `NODE_ENV` | Yes | `production` for production |
| `DB_PRIMARY_HOST` | Yes | Primary PostgreSQL host |
| `DB_PRIMARY_PORT` | Yes | Primary PostgreSQL port (5432) |
| `DB_PRIMARY_NAME` | Yes | Database name |
| `DB_PRIMARY_USER` | Yes | Database user |
| `DB_PRIMARY_PASSWORD` | Yes | Database password |
| `DB_REPLICA_HOSTS` | No | Comma-separated replica hosts (enables read replicas) |
| `DB_REPLICA_PORT` | No | Replica port (default 5432) |
| `DB_REPLICA_NAME` | No | Replica database name |
| `DB_REPLICA_USER` | No | Replica user |
| `DB_REPLICA_PASSWORD` | No | Replica password |
| `DB_HOST` | Yes* | Primary host (used by migration runner, same as RDS primary) |
| `DB_PORT` | Yes* | Primary port (5432) |
| `DB_NAME` | Yes | Database name |
| `DB_USER` | Yes* | Primary user (migration runner) |
| `DB_PASSWORD` | Yes* | Primary password (migration runner) |
| `DB_REPLICA_HOSTS` | No | Comma-separated replica hosts |
| `DB_REPLICA_PORT` | No | Replica port |
| `DB_REPLICA_NAME` | No | Replica database name |
| `DB_REPLICA_USER` | No | Replica user |
| `DB_REPLICA_PASSWORD` | No | Replica password |
| `VALKEY_HOST` | Yes | Valkey (ElastiCache) endpoint |
| `VALKEY_PORT` | Yes | Valkey port (6379) |
| `VALKEY_PASSWORD` | Yes | Valkey auth token |
| `JWT_SECRET` | Yes | JWT signing secret (min 32 chars) |
| `ENCRYPTION_KEY` | Yes | Encryption key (32 bytes, hex) |
| `PAYMOB_API_KEY` | Yes | Paymob API key |
| `PAYMOB_MERCHANT_ID` | Yes | Paymob merchant ID |
| `PAYMOB_INTEGRATION_ID` | Yes | Paymob integration ID |
| `S3_BUCKET` | Yes | S3 bucket name |
| `S3_REGION` | Yes | S3 region |
| `AWS_REGION` | Yes | AWS region |
| `SENTRY_DSN` | No | Sentry DSN for error tracking |
| `EMAIL_FROM` | No | From address for emails |

*Legacy variables used by migration runner only.

### Kubernetes Secret Keys

Secrets are managed via AWS Secrets Manager and synced to Kubernetes by External Secrets Operator.

| Secret Name | Key | Description |
|-------------|-----|-------------|
| hakawi-backend-secrets | db.host | Primary RDS endpoint |
| hakawi-backend-secrets | db.password | Database password |
| hakawi-backend-secrets | valkey.password | Valkey auth token |
| hakawi-backend-secrets | jwt.secret | JWT signing secret |
| hakawi-backend-secrets | jwt.refresh | Refresh token secret |
| hakawi-backend-secrets | encryption.key | Encryption key |
| hakawi-backend-secrets | paymob.api-key | Paymob API key |
| hakawi-backend-secrets | paymob.merchant-id | Paymob merchant ID |
| hakawi-backend-secrets | paymob.integration-id | Paymob integration ID |
| hakawi-backend-secrets | paymob.webhook-secret | Paymob webhook secret |

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

# Expected response (with replicas):
{
  "status": "healthy",
  "database": "connected",
  "replicas": ["connected", "connected"],
  "valkey": "connected",
  "timestamp": "2026-01-01T12:00:00.000Z"
}

# Response without replicas:
{
  "status": "healthy",
  "database": "connected",
  "replicas": [],
  "valkey": "connected",
  "timestamp": "2026-01-01T12:00:00.000Z"
}

# Degraded (primary down):
{
  "status": "degraded",
  "database": "disconnected",
  "replicas": ["connected", "connected"],
  "valkey": "connected",
  "timestamp": "2026-01-01T12:00:00.000Z"
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

### Replication Lag Monitoring

Add to Prometheus alerting rules:

```yaml
- alert: PostgreSQLReplicationLag
  expr: pg_replication_lag_seconds > 30
  for: 5m
  labels:
    severity: warning
  annotations:
    summary: "PostgreSQL replication lag high"
    description: "Replication lag exceeds 30 seconds"
```

### Logs

Logs are structured JSON via Winston. Configure your log aggregator to parse:
- `level`: log level
- `message`: log message
- `correlationId`: request correlation ID
- `context`: additional context

### Alerting

Alert rules are defined in `monitoring/prometheus/rules/hakawi-alerts.yml`. To deploy:

1. Prometheus is auto-deployed via Terraform monitoring module (kube-prometheus-stack Helm chart)
2. Alertmanager routes to configured notification channels (Slack, email, PagerDuty)
3. Test alerts with `kubectl apply -f monitoring/prometheus/test-alert.json`

## Backup Strategy

### Automated Backups

- **RDS**: Automated snapshots daily, 30-day retention, cross-region copy
- **Valkey**: RDB snapshots every 6 hours, AOF persistence, 7-day retention
- **S3**: Versioning enabled, cross-region replication for media bucket
- **Kubernetes**: etcd automatic backups to S3 bucket (via Velero)

### Manual Database Backup

```bash
# Trigger a manual RDS snapshot
aws rds create-db-snapshot \
  --db-instance-identifier hakawi-production-db \
  --db-snapshot-identifier hakawi-manual-$(date +%Y%m%d)

# Export RDS snapshot to S3
aws rds export-snapshot-to-s3 \
  --export-task-identifier hakawi-export-$(date +%Y%m%d) \
  --source-arn arn:aws:rds:us-east-1:123456789012:snapshot:hakawi-manual-$(date +%Y%m%d) \
  --s3-bucket hakawi-backups \
  --s3-prefix rds-exports
```

## Rollback

### Docker Compose (Local)

```bash
# Rollback to previous image
docker compose up -d --force-recreate backend frontend
```

### Kubernetes (Production)

```bash
# Rollback deployment
helm rollback hakawi-backend -n hakawi
helm rollback hakawi-frontend -n hakawi

# Check status
kubectl rollout status deployment/hakawi-backend -n hakawi --timeout=300s
```

## Security

### Checklist

- [x] All secrets stored in AWS Secrets Manager (not in Terraform state)
- [x] HTTPS enabled with ACM-managed TLS certificates
- [x] Database not exposed to public internet (private subnets only)
- [x] Replicas not exposed to public internet (private subnets only)
- [x] Valkey password protected with auto-rotated auth token
- [x] S3 bucket private (access via CloudFront OAI only)
- [x] Network ACLs and security groups restrict access
- [x] Rate limiting enabled via WAF
- [x] WAF rules active on ALB
- [x] Error tracking enabled (Sentry)
- [x] Backup encryption enabled (KMS-managed keys)
- [x] IAM roles use IRSA (no static credentials in pods)
- [x] Pod Security Standards enforced (restricted policy)
- [x] Container images scanned at build time

### TLS/HTTPS

TLS certificates are provisioned automatically via AWS Certificate Manager (ACM) and attached to the ALB Ingress.

## Troubleshooting

### Backend won't start

```bash
# Check logs
kubectl logs -n hakawi deployment/hakawi-backend --tail=100

# Check events
kubectl describe pod -n hakawi -l app.kubernetes.io/name=backend

# Common issues:
# - Missing environment variables
# - Secret not synced (check ExternalSecrets)
# - Database connectivity (check VPC peering, security groups)
```

### Replica connection issues

```bash
# Check RDS replica status
aws rds describe-db-instances --db-instance-identifier hakawi-production-db \
  --query "DBInstances[0].Status"

# Check Valkey connectivity
kubectl exec -n hakawi deployment/hakawi-backend -- redis-cli -h <valkey-endpoint> ping
```

### Database connection issues

```bash
# Test connection from within the pod
kubectl exec -n hakawi deployment/hakawi-backend -- \
  psql -h <rds-endpoint> -U hakawi_user -d hakawi -c "SELECT 1;"

# Check RDS status
aws rds describe-db-instances --db-instance-identifier hakawi-production-db

# Check secret sync
kubectl get externalsecret -n hakawi hakawi-backend-secrets -o yaml
```

### Frontend build fails

```bash
# Check build logs
kubectl logs -n hakawi deployment/hakawi-frontend --tail=100
```

## Performance

### Recommended Resources (Kubernetes on AWS)

| Service | CPU | Memory | Storage |
|---------|-----|--------|---------|
| Backend (per pod) | 500m | 512Mi | N/A |
| Frontend (per pod) | 100m | 256Mi | N/A |
| PostgreSQL Primary | 4 vCPU | 8 GB | 100 GB (gp3) |
| PostgreSQL Replica (x2) | 2 vCPU | 4 GB | 100 GB (gp3) |
| Valkey (cache.r6g.large) | 2 vCPU | 4 GB | 7.5 GB |
| EKS Nodes (m6i.xlarge) | 4 vCPU | 16 GB | 100 GB (per node) |

### Optimization

- CDN for static assets via CloudFront (pointing to S3 origin)
- Database connection pooling via RDS Proxy
- Valkey persistence with both RDB and AOF
- Read replicas for read-heavy workloads (SELECT → replicas)
- Gzip compression at ALB level
- Monitor replication lag (alert if > 30s)
- Enable EKS cluster autoscaling

### Read Replica Best Practices

1. **Read-your-writes consistency**: After a write, read from primary for immediate consistency
2. **Stale reads acceptable**: Analytics, listings, search can tolerate replica lag
3. **Post-write redirect**: After `POST /stories`, next `GET /stories` hits primary
4. **Auth checks**: Always hit primary for auth/authorization queries
5. **Financial queries**: Payments, rentals always use primary
