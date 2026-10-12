# Hakawi Backend Helm Chart

A Helm chart for deploying the Hakawi backend (NestJS) API to Kubernetes.

## Prerequisites

- Kubernetes 1.24+
- Helm 3.12+
- EKS cluster with IRSA configured (for AWS Secrets Manager access)
- AWS Secrets Manager entries created for this environment

## Installing the Chart

```bash
# Install with default values
helm upgrade --install hakawi-backend ./infrastructure/helm/backend \
  --namespace hakawi \
  --set image.tag=v1.0.0 \
  --set env.db.primaryHost=<rds-writer-endpoint>

# Install with production values
helm upgrade --install hakawi-backend ./infrastructure/helm/backend \
  --namespace hakawi \
  --values values.yaml \
  --values values-production.yaml \
  --set image.tag=v1.0.0 \
  --set env.db.primaryHost=<rds-writer-endpoint>
```

The chart fails fast if `env.db.primaryHost` is empty, because that key is the one `deployment.yaml`
actually consumes for `DB_PRIMARY_HOST` (`env.db.host` is not read by this chart).

## Required Values

| Parameter | Description |
|-----------|-------------|
| `image.repository` | Container image repository |
| `image.tag` | Container image tag |
| `env.db.primaryHost` | Primary (writer) RDS endpoint |
| `serviceAccount.annotations.eks\.amazonaws\.com/role-arn` | IRSA role ARN for Secrets Manager access |

## Optional Values

See `values.yaml` for all configuration options. Key settings:

- `replicaCount`: Number of pod replicas
- `resources`: CPU/memory requests and limits
- `autoscaling.enabled`: Enable HorizontalPodAutoscaler
- `podDisruptionBudget.enabled`: Enable PDB for graceful upgrades

## Secrets

Secrets are managed via AWS Secrets Manager and synced to Kubernetes using
External Secrets Operator. The backend IRSA role must have `secretsmanager:GetSecretValue`
permissions on the following secret ARNs:

- `hakawi/<env>/db/host`
- `hakawi/<env>/db/user`
- `hakawi/<env>/db/password`
- `hakawi/<env>/valkey/password`
- `hakawi/<env>/jwt/secret`
- `hakawi/<env>/jwt/refresh-secret`
- `hakawi/<env>/encryption/key`
- `hakawi/<env>/paymob/*`
- `hakawi/<env>/sentry/dsn`

## Health Checks

Three probes, three different jobs:

| Probe | Route | Purpose |
|-------|-------|---------|
| `startupProbe` | `GET /api/v1/health` | Absorbs a slow first boot (migrations, cold JIT, image pull) so the liveness probe does not kill a pod that was merely still starting. |
| `livenessProbe` | `GET /api/v1/health` | Always-200 route: restarts the container only when the process itself is wedged, never for a database outage. |
| `readinessProbe` | `GET /api/v1/health/ready` | Returns 503 unless the PRIMARY database **and** Valkey are reachable; this is what removes a pod from the Service endpoints. |

`GET /api/v1/health` intentionally stays 200 when a dependency is down, so it must never be
used as a readiness probe.

## Metrics

Pods are scraped through the standard `prometheus.io/*` pod annotations consumed by
kube-prometheus-stack's `role: pod` discovery:

```yaml
podAnnotations:
  prometheus.io/scrape: "true"
  prometheus.io/port: "3001"          # container port, not the Service port
  prometheus.io/path: "/api/v1/metrics"  # Prometheus text exposition, NOT /api/v1/health
```

## Resource Recommendations

| Environment | CPU Request | Memory Request | CPU Limit | Memory Limit | Replicas |
|-------------|-------------|----------------|-----------|--------------|----------|
| dev | 250m | 256Mi | 500m | 512Mi | 1 |
| staging | 250m | 256Mi | 1000m | 1Gi | 2 |
| production | 1000m | 1Gi | 4000m | 4Gi | 5-min, 30-max |