# Hakawi Frontend Helm Chart

A Helm chart for deploying the Hakawi frontend (Next.js) to Kubernetes.

## Prerequisites

- Kubernetes 1.24+
- Helm 3.12+
- EKS cluster with Ingress controller configured
- AWS Secrets Manager entries created for this environment

## Installing the Chart

```bash
# Install with default values
helm upgrade --install hakawi-frontend ./infrastructure/helm/frontend \
  --namespace hakawi \
  --set image.tag=v1.0.0

# Install with production values
helm upgrade --install hakawi-frontend ./infrastructure/helm/frontend \
  --namespace hakawi \
  --values values.yaml \
  --values values-production.yaml \
  --set image.tag=v1.0.0
```

## Required Values

| Parameter | Description |
|-----------|-------------|
| `image.repository` | Container image repository |
| `image.tag` | Container image tag |
| `env.db.host` | RDS/Valkey host (for backend API URL construction) |

## Optional Values

See `values.yaml` for all configuration options.

## Ingress

The chart creates an Ingress resource with TLS via cert-manager. The following hosts are configured:

- `app.hakawi.com` → frontend
- `hakawi.com` → frontend (apex redirect)

## Health Checks

- Liveness: `GET /api/health`
- Readiness: `GET /api/health`

## Resource Recommendations

| Environment | CPU Request | Memory Request | CPU Limit | Memory Limit | Replicas |
|-------------|-------------|----------------|-----------|--------------|----------|
| dev | 50m | 128Mi | 250m | 256Mi | 1 |
| staging | 50m | 128Mi | 500m | 512Mi | 2 |
| production | 500m | 512Mi | 2000m | 2Gi | 5-min, 20-max |

## Security

- Runs as non-root user (UID 10001)
- Read-only root filesystem
- All Linux capabilities dropped
- Seccomp profile: `RuntimeDefault`
- No `serviceAccount` annotations (frontend does not need AWS API access)