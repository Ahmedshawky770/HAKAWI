# Operational Runbooks

## Overview

This document contains runbooks for common operational tasks in the Hakawi production environment.
All infrastructure is managed via Terraform on AWS with Kubernetes (EKS) as the runtime.

## 1. Database Migration Runbook

### 1.1 Run Migrations in Production

```bash
# 1. Ensure kubectl context is set to production
kubectl config use-context production

# 2. Identify the backend pod
POD=$(kubectl get pods -n hakawi -l app.kubernetes.io/name=backend -o jsonpath='{.items[0].metadata.name}')

# 3. Run migrations
kubectl exec -n hakawi "$POD" -- npx drizzle-kit migrate --config=./backend/drizzle.config.ts

# 4. Verify migration count
kubectl exec -n hakawi "$POD" -- psql -h "$DB_HOST" -U hakawi_user -d hakawi -c "SELECT count(*) FROM drizzle_migrations WHERE rolled_back_at IS NULL;"
```

### 1.2 Check Migration Status

```bash
POD=$(kubectl get pods -n hakawi -l app.kubernetes.io/name=backend -o jsonpath='{.items[0].metadata.name}')

kubectl exec -n hakawi "$POD" -- npm run migration:status --workspace=backend
```

### 1.3 Rollback a Single Migration

```bash
POD=$(kubectl get pods -n hakawi -l app.kubernetes.io/name=backend -o jsonpath='{.items[0].metadata.name}')

kubectl exec -n hakawi "$POD" -- npm run migration:rollback --workspace=backend -- --to 0000_create_users_table --allow-data-loss
```

**Warning:** Rollbacks destroy data. Use only with `--allow-data-loss` and on a staging-like copy first.

### 1.4 Migration Verification Checklist

Before merging a migration PR:

- [ ] Migration filename follows pattern: `YYYYMMDD_HHMMSS_description.ts`
- [ ] Down migration is provided and tested
- [ ] Migration runs successfully on a fresh database
- [ ] Migration is idempotent (re-running produces identical state)
- [ ] Rollback drops created tables/objects (not just updates the ledger)
- [ ] Zod schema is extended if new env vars are introduced

## 2. Incident Response

### 2.1 Backend Pod CrashLoopBackOff

```bash
# Check pod logs
kubectl logs -n hakawi -l app.kubernetes.io/name=backend --tail=100 --previous

# Check pod events
kubectl describe pod -n hakawi -l app.kubernetes.io/name=backend

# Check external secret sync
kubectl get externalsecret -n hakawi hakawi-backend-secrets -o yaml

# Restart deployment
kubectl rollout restart deployment/hakawi-backend -n hakawi
kubectl rollout status deployment/hakawi-backend -n hakawi --timeout=300s
```

### 2.2 Database Connection Errors

```bash
# Check RDS status
aws rds describe-db-instances --db-instance-identifier hakawi-production-db \
  --query "DBInstances[0].{Status:DBInstanceStatus,State:DBInstanceIdentifier}"

# Check security group rules
aws ec2 describe-security-groups --group-ids $(terraform output -raw db_security_group_id)

# Check VPC connectivity from pod
kubectl exec -n hakawi -it deploy/hakawi-backend -- ping -c 3 $(kubectl get secret hakawi-backend-secrets -o jsonpath='{.data.db\.host}' | base64 -d)

# Check RDS parameter group settings
aws rds describe-db-instances --db-instance-identifier hakawi-production-db \
  --query "DBInstances[0].DBParameterGroups"
```

### 2.3 Valkey Connection Issues

```bash
# Check ElastiCache status
aws elasticache describe-cache-clusters --cache-cluster-id hakawi-production

# Check auth token (via Secrets Manager)
aws secretsmanager get-secret-value --secret-id hakawi/production/valkey/password --query SecretString --output text

# Test connectivity from pod
kubectl exec -n hakawi -it deploy/hakawi-backend -- \
  redis-cli -h $(kubectl get secret hakawi-backend-secrets -o jsonpath='{.data.valkey\.host}' | base64 -d) -a $(kubectl get secret hakawi-backend-secrets -o jsonpath='{.data.valkey\.password}' | base64 -d) ping
```

### 2.4 Frontend Serving Errors (404/500)

```bash
# Check frontend pod status
kubectl get pods -n hakawi -l app.kubernetes.io/name=frontend

# Check ingress status
kubectl describe ingress hakawi-frontend-ingress -n hakawi

# Check CloudFront distribution
aws cloudfront list-distributions --query "DistributionList.Items[?Origins.Items[0].Id=='hakawi-production-media.s3.us-east-1.amazonaws.com']"

# Force cache invalidation
aws cloudfront create-invalidation --distribution-id E123456789012 --paths "/*"
```

### 2.5 High CPU/Memory Usage

```bash
# Check pod resource usage
kubectl top pods -n hakawi

# Check HPA status
kubectl get hpa -n hakawi

# Check if scaling events occurred
kubectl describe hpa hakawi-backend-hpa -n hakawi

# Temporarily increase resources (patch the deployment)
kubectl patch deployment hakawi-backend -n hakawi -p '{"spec":{"template":{"spec":{"containers":[{"name":"backend","resources":{"requests":{"cpu":"500m","memory":"1Gi"},"limits":{"cpu":"2000m","memory":"2Gi"}}}]}}}}'
```

### 2.6 S3 Upload Failures

```bash
# Check bucket policy
aws s3api get-bucket-policy --bucket hakawi-production-media

# Check CloudFront OAI
aws cloudfront get-distribution --id E123456789012 --query "Distribution.LambdaFunctionAssociations"

# Test upload from pod
kubectl exec -n hakawi -it deploy/hakawi-backend -- \
  aws s3 cp /dev/null s3://hakawi-production-media/test-upload.txt
```

## 3. Scaling Operations

### 3.1 Scale Backend Manually

```bash
# Scale to N replicas
kubectl scale deployment hakawi-backend --replicas=N -n hakawi

# Verify
kubectl get pods -n hakawi -l app.kubernetes.io/name=backend
```

### 3.2 Update Image Version

```bash
# Using Helm
helm upgrade hakawi-backend ./infrastructure/helm/backend \
  --namespace hakawi \
  --set image.tag=v1.2.3 \
  --set image.repository=ghcr.io/hakawi-io/hakawi-backend

# Verify rollout
kubectl rollout status deployment/hakawi-backend -n hakawi --timeout=300s
```

### 3.3 Blue-Green Deployment

```bash
# Create a new deployment with a different version
kubectl apply -f k8s/backend-v2.yaml

# Test the new version
kubectl exec -n hakawi deploy/hakawi-backend-v2 -- curl -s http://localhost:3001/health

# Switch traffic (update ingress/service selector)
kubectl patch service hakawi-backend-service -n hakawi -p '{"spec":{"selector":{"app":"hakawi-backend-v2"}}}'

# Decommission old version
kubectl delete deployment hakawi-backend -n hakawi
```

## 4. Monitoring and Alerting

### 4.1 Check Existing Alerts

```bash
# Prometheus alerts
kubectl port-forward svc/kube-prometheus-stack-prometheus -n monitoring 9090 &
curl -s http://localhost:9090/api/v1/alerts | jq .

# Grafana dashboards
kubectl port-forward svc/kube-prom-stack-grafana -n monitoring 3000:3000 &
open http://localhost:3000
```

### 4.2 Add a New Alert

1. Edit `monitoring/prometheus/rules/hakawi-alerts.yml`
2. Add the alert rule under the appropriate group
3. Commit and push — CI will deploy the updated rules

### 4.3 Check Database Metrics

```bash
# Check RDS metrics via CloudWatch
aws cloudwatch get-metric-statistics \
  --namespace AWS/RDS \
  --metric-name CPUUtilization \
  --dimensions Name=DBInstanceIdentifier,Value=hakawi-production-db \
  --statistics Average \
  --period 300 \
  --start-time $(date -u -d '1 hour ago' '+%Y-%m-%dT%H:%M:%SZ') \
  --end-time $(date -u '+%Y-%m-%dT%H:%M:%SZ')
```

## 5. Secrets Management

### 5.1 Rotate a Secret

```bash
# 1. Update the secret in AWS Secrets Manager
aws secretsmanager put-secret-value \
  --secret-id hakawi/production/db/password \
  --secret-string "new-strong-password"

# 2. External Secrets Operator will auto-refresh within 60 seconds
# 3. Restart pods to pick up the new secret
kubectl rollout restart deployment/hakawi-backend -n hakawi
```

### 5.2 Audit Secret Usage

```bash
# List ExternalSecrets
kubectl get externalsecret -n hakawi -o wide

# Check which pods are using which secrets
kubectl describe pods -n hakawi -o jsonpath='{.items[*].spec.containers[*].envFrom[*].secretRef[*].name}' | tr ' ' '\n' | sort -u
```

## 6. Disaster Recovery

### 6.1 Restore from RDS Snapshot

```bash
# 1. List available snapshots
aws rds describe-db-snapshots \
  --db-instance-identifier hakawi-production-db \
  --query "DBSnapshots[].SnapshotIdentifier"

# 2. Restore to a new instance (for testing)
aws rds restore-db-instance-from-db-snapshot \
  --db-instance-identifier hakawi-restore-test \
  --db-snapshot-identifier hakawi-production-db-2026-01-01

# 3. Update the application to point to the restored instance
# 4. Verify data integrity
# 5. Promote or update DNS
```

### 6.2 Emergency Rollback Full Deployment

```bash
# 1. Get the previous revision
helm history hakawi-backend -n hakawi

# 2. Rollback to previous revision
helm rollback hakawi-backend -n hakawi 1

# 3. Verify
helm status hakawi-backend -n hakawi
kubectl rollout status deployment/hakawi-backend -n hakawi --timeout=300s
```