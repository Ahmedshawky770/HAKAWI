# ADR-009: Infrastructure as Code Migration

- **Date:** 2026-10-08
- **Status:** Accepted
- **Tags:** infrastructure, terraform, kubernetes, aws, helm
- **Deciders:** DevOps Team, Architecture Review Board

## Context

The Hakawi project previously relied on `docker-compose.yml` for both local development
and production deployment. There was:

1. No Terraform or Kubernetes manifests — infrastructure was manually provisioned on AWS
2. No staging environment — only a single production deployment path
3. No Infrastructure as Code — manual AWS console changes with no drift detection
4. No secrets management in production — secrets passed as plaintext environment variables
5. No connection pooling at scale — PgBouncer was defined in docker-compose but not managed independently

The `docker-compose.yml` contained a reference architecture (postgres-primary, postgres-replica-1/2,
pgbouncer-primary/replica, valkey) that described the intended production topology but lacked
operational automation.

### Principle Mapping

| Principle | Violation | Evidence |
|-----------|-----------|----------|
| #6 (Minimize Migrations) | No state drift detection | Manual AWS changes, no `terraform plan` gate |
| #9 (Single Source of Truth) | No secrets management | Plaintext passwords in `.env.production` files |
| #14 (AP as Default) | No HA | Single-instance PostgreSQL, single Valkey node |
| #15 (Proactive Defense) | No network isolation | Containers exposed on all interfaces |

## Decision

Adopt **Terraform** for AWS infrastructure provisioning, **Amazon EKS** (Kubernetes 1.28)
as the runtime platform, and **Helm charts** for application deployment. This replaces
the docker-compose-only model for production and staging environments.

### Selected Technologies

| Component | Tool | Rationale |
|-----------|------|-----------|
| Infrastructure provisioning | Terraform v1.9 | Cloud-agnostic, state-managed, drift detection |
| Container orchestration | Amazon EKS (Kubernetes 1.28) | Managed control plane, HA worker nodes, IAM integration |
| Application deployment | Helm 3 | Package management, rollback, versioned releases |
| Overlay configuration | Kustomize | Environment-specific patches (dev/staging/production) |
| Secrets management | AWS Secrets Manager + External Secrets Operator | KMS-encrypted, auto-rotation, no plaintext secrets |
| Secrets distribution | IRSA roles | No static credentials in pods, principle of least privilege |
| Monitoring | kube-prometheus-stack (Helm) | Prometheus + Grafana + Alertmanager, S3 backup |
| Load balancing | AWS Load Balancer Controller + ALB Ingress | TLS termination, WAF integration, host-based routing |
| DNS | Route 53 | Health checks, failover routing, low TTL updates |

### Architecture Mapping from docker-compose.yml

The docker-compose.yml architecture was translated to managed AWS services:

| docker-compose service | AWS Managed Equivalent |
|------------------------|------------------------|
| `postgres-primary` | RDS PostgreSQL (primary, `db.r6g.xlarge`) |
| `postgres-replica-1` / `postgres-replica-2` | RDS Read Replicas (2x, `db.r6g.xlarge`) |
| `pgbouncer-primary` / `pgbouncer-replica` | RDS Proxy (managed, auto-scaling) |
| `valkey` | ElastiCache Valkey 8 (replication group, KMS-encrypted) |
| `backend` | EKS Deployment (3-5 pods, HPA-enabled) |
| `frontend` | EKS Deployment (3-5 pods, HPA-enabled) |
| `nginx` (implicit) | AWS Application Load Balancer (via Ingress) |

### Environment Strategy

| Environment | Namespace | DB Instance | EKS Nodes | Replicas | Purpose |
|-------------|-----------|-------------|-----------|----------|---------|
| `dev` | `hakawi` | `db.t3.medium` | 2x `t3.medium` | 1 each | Development testing |
| `staging` | `hakawi` | `db.r6g.large` | 2x `m6i.xlarge` | 2 each | Pre-production, mirrors prod |
| `production` | `hakawi` | `db.r6g.xlarge` | 3x `m6i.2xlarge` | 5 each | Production traffic |

## Implementation

### Terraform Module Structure

```
infrastructure/terraform/
├── main.tf                              # Root module
├── variables.tf                         # Input validation
├── outputs.tf                           # Stack outputs
├── modules/
│   ├── vpc/                             # 3 AZs, private/public subnets
│   ├── rds/                             # Primary + read replicas
│   ├── elasticache/                     # Valkey 8 with encryption
│   ├── eks/                             # Cluster + managed node groups
│   ├── iam/                             # IRSA roles for each service
│   ├── s3/                              # Media bucket + CloudFront OAI
│   └── monitoring/                      # Prometheus/Grafana/Alertmanager
└── environments/
    ├── dev/terraform.tfvars
    ├── staging/terraform.tfvars
    └── production/terraform.tfvars
```

### Kubernetes Overlay Structure

```
infrastructure/kubernetes/
├── base/                                # Shared manifests
│   ├── namespaces.yaml
│   ├── configmap.yaml
│   ├── secrets.yaml
│   ├── backend/
│   └── frontend/
└── overlays/
    ├── dev/kustomization.yaml           # 1 replica, t3.medium, low resources
    ├── staging/kustomization.yaml       # 2 replicas, ExternalSecrets, PDBs
    └── production/kustomization.yaml    # 5 replicas, full HA, WAF
```

### Helm Charts

```
infrastructure/helm/
├── backend/                             # NestJS API chart
│   ├── Chart.yaml
│   ├── values.yaml
│   ├── templates/
│   │   ├── _helpers.tpl
│   │   └── deployment.yaml              # All k8s objects in one template
│   └── README.md
└── frontend/                            # Next.js chart
    ├── Chart.yaml
    ├── values.yaml
    ├── templates/
    │   ├── _helpers.tpl
    │   └── deployment.yaml
    └── README.md
```

## Consequences

### Positive

1. **State management** — Terraform state in S3 with DynamoDB locking prevents concurrent runs
2. **Drift detection** — `terraform plan` in CI catches infrastructure drift
3. **Secrets safety** — No plaintext secrets in version control; KMS-encrypted in Secrets Manager
4. **HA everywhere** — Multi-AZ RDS, 3+ EKS nodes, multi-zone pod distribution
5. **Rollback capability** — `helm rollback`, `kubectl rollout undo` for application changes
6. **Cost control** — `terraform plan` shows cost changes before applying
7. **Staging parity** — Staging mirrors production (same architecture, scaled down)

### Negative / Trade-offs

1. **Complexity** — EKS + Terraform + Helm + Kustomize requires more DevOps knowledge
2. **AWS lock-in** — EKS, RDS, ElastiCache are AWS-specific; multi-region DR would be complex
3. **Learning curve** — Team must learn Terraform, Kubernetes, Helm, IRSA patterns
4. **Operational cost** — Managed services cost more than self-managed docker-compose
5. **Migration risk** — Existing docker-compose deployments need to be migrated

### Mitigated Risks

1. **"Cannot connect to database"** — RDS Proxy handles connection draining, security groups
   restrict access to EKS node CIDR blocks only
2. **"Cannot read secrets"** — External Secrets Operator refreshes every 1 hour; fallback to
   manual `kubectl apply` with `kubectl create secret` if needed
3. **"Migration hangs"** — Migrations run against RDS primary with a 60-second timeout in CI
4. **"Rollback data loss"** — Database is never rolled back; only application pods are
5. **"Deployment hangs"** — Pod disruption budgets prevent voluntary disruption below
   `minAvailable` threshold

### Unmitigated Risks

1. **Regional outage** — No cross-region active-active setup
2. **Git rootkit** — Terraform state compromise could affect all environments
3. **Schema lock-in** — Migration verification exists for SQL files, not for Drizzle ORM state

## Alternatives Considered

1. **ECS Fargate** — Rejected: less mature tooling ecosystem, no standard Kustomize/Helm support
2. **Self-managed Kubernetes** — Rejected: operational burden of patching control plane
3. **CDK (Cloud Development Kit)** — Rejected: would require team to learn TypeScript infrastructure,
   whereas Terraform is already the standard
4. **Pulumi** — Rejected: would require learning a new framework, less community adoption
5. **Staying with docker-compose** — Explicitly rejected: no staging environment, no state management,
   no secrets safety, no HA

## References

- `infrastructure/terraform/` — Terraform configurations
- `infrastructure/kubernetes/` — Kubernetes manifests and overlays
- `infrastructure/helm/` — Helm charts for backend and frontend
- `infrastructure/scripts/` — CLI helpers for init, deploy, IAM setup
- `docs/deployment/deployment.md` — Updated deployment guide
- `docs/deployment/infrastructure-as-code.md` — IaC overview
- `docs/deployment/runbooks.md` — Operational runbooks

This ADR supersedes the docker-compose-only deployment model described in the original
`docs/deployment/deployment.md` and the `docker-compose.yml` reference file.