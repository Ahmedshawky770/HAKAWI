# Infrastructure as Code

## Overview

This document describes the Infrastructure as Code (IaC) setup for the Hakawi platform. The IaC is built with Terraform on AWS, with Kubernetes (EKS) as the runtime layer and Helm charts for application deployment.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              VPC (10.0.0.0/16)                              │
│                                                                             │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐             │
│  │   AZ A (a)      │  │   AZ B (b)      │  │   AZ C (c)      │             │
│  │                 │  │                 │  │                 │             │
│  │  Private Subnet │  │  Private Subnet │  │  Private Subnet │             │
│  │  10.0.1.0/24    │  │  10.0.2.0/24    │  │  10.0.3.0/24    │             │
│  │                 │  │                 │  │                 │             │
│  │  RDS Primary    │  │  RDS Replica    │  │  RDS Replica    │             │
│  │  (r6g.xlarge)   │  │  (r6g.xlarge)   │  │  (r6g.xlarge)   │             │
│  │                 │  │                 │  │                 │             │
│  │  Nat Gateway    │  │  Nat Gateway    │  │  Nat Gateway    │             │
│  │                 │  │                 │  │                 │             │
│  │  EKS Nodes      │  │  EKS Nodes      │  │  EKS Nodes      │             │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘             │
│                                                                             │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐             │
│  │  Public Subnet  │  │  Public Subnet  │  │  Public Subnet  │             │
│  │  10.0.101.0/24  │  │  10.0.102.0/24  │  │  10.0.103.0/24  │             │
│  │                 │  │                 │  │                 │             │
│  │  IGW + Routes   │  │  IGW + Routes   │  │  IGW + Routes   │             │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘             │
│                                                                             │
│  VPC Endpoints (S3, ECR, CloudWatch, STS)                                    │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                       EKS Cluster (1.28)                                   │
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │  Namespace: hakawi                                                    │   │
│  │                                                                      │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                │   │
│  │  │  Backend     │  │  Frontend    │  │  Ingress     │                │   │
│  │  │  (Helm)      │  │  (Helm)      │  │  (NGINX)     │                │   │
│  │  │  3-5 pods     │  │  3-5 pods     │  │              │                │   │
│  │  └──────────────┘  └──────────────┘  └──────────────┘                │   │
│  │                                                                      │   │
│  │  ┌──────────────┐  ┌──────────────┐                                  │   │
│  │  │  Valkey      │  │  PgBouncer   │                                  │   │
│  │  │  (ElastiCache│  │  (Self-mgmt  │                                  │   │
│  │  │   via RDS    │  │   on EC2)    │                                  │   │
│  │  └──────────────┘  └──────────────┘                                  │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │  Namespace: monitoring                                                │   │
│  │                                                                      │   │
│  │  Prometheus + Grafana + Alertmanager                                  │   │
│  │  (via Helm: kube-prometheus-stack)                                    │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  External Services:                                                         │
│  - S3 (Media Storage)                                                      │
│  - CloudFront (CDN)                                                        │
│  - Route 53 (DNS)                                                          │
│  - ACM (TLS Certificates)                                                  │
│  - Secrets Manager (Credentials)                                           │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Directory Structure

```
infrastructure/
├── terraform/
│   ├── main.tf                          # Root module, imports all child modules
│   ├── variables.tf                     # Input variables with validation
│   ├── outputs.tf                       # Output values
│   ├── modules/
│   │   ├── vpc/                         # VPC, subnets, IGW, NAT, SGs
│   │   ├── rds/                         # RDS PostgreSQL + read replicas
│   │   ├── elasticache/                 # Valkey replication group
│   │   ├── eks/                         # EKS cluster + node groups + add-ons
│   │   ├── iam/                         # IRSA roles and policies
│   │   ├── s3/                          # S3 bucket for media storage
│   │   └── monitoring/                  # Prometheus/Grafana via Helm
│   └── environments/
│       ├── dev/terraform.tfvars         # Development configuration
│       ├── staging/terraform.tfvars     # Staging configuration
│       └── production/terraform.tfvars # Production configuration
├── kubernetes/
│   ├── base/                            # Base manifests
│   │   ├── kustomization.yaml
│   │   ├── namespaces.yaml
│   │   ├── configmap.yaml
│   │   ├── secrets.yaml
│   │   ├── backend/
│   │   └── frontend/
│   └── overlays/
│       ├── dev/kustomization.yaml       # Development overlay
│       ├── staging/kustomization.yaml   # Staging overlay
│       └── production/kustomization.yaml # Production overlay
└── helm/
    ├── backend/                         # Backend Helm chart
    └── frontend/                        # Frontend Helm chart
```

## Principle Compliance

### Principle #1: Zero `any` / `as any` Policy

The Terraform modules use explicit type constraints on all variables:
- `variable "environment" { type = string }`
- `variable "private_subnets" { type = list(string) }`
- `variable "cors_rules" { type = list(object({ ... })) }`

### Principle #2: Logger Over `console`

- Backend pods emit structured JSON logs via Winston
- Kubernetes logs are collected via CloudWatch Container Insights
- No `console.log` in production frontend code

### Principle #3: IDs as Strings

- All Kubernetes resources use string labels and annotations
- Terraform outputs are strongly typed strings
- Secret keys are string references, never numeric IDs

### Principle #4: Document Problems and Solutions

- Every module has inline `WHY` comments explaining design decisions
- ADR-007: Infrastructure as Code decisions are documented
- Runbooks in `docs/runbooks/` cover operational procedures

### Principle #5: Architecture Before Code

- Architecture diagrams above
- C4 model covers infrastructure boundaries
- Kubernetes manifests follow declarative-first approach

### Principle #6: Minimize Migrations

- Terraform state uses S3 backend with DynamoDB for locking
- Infrastructure changes require PR + plan review
- No drift detection bypasses — `terraform plan` is a CI gate

### Principle #7: Loose Coupling Between Modules

- Each Terraform module is independent (VPC, RDS, EKS, etc.)
- Kubernetes namespaces isolate: `hakawi`, `monitoring`, `ingress-nginx`
- Services communicate via Service Accounts and IRSA roles
- No module imports another's internals directly

### Principle #8: Open for Extension, Closed for Modification

- Helm charts allow environment-specific value overrides
- Kustomize overlays for dev/staging/production layering
- Ingress annotations and pod annotations are extensible

### Principle #9: Single Source of Truth (SSOT)

- Terraform state stored in a single S3 backend
- Secrets managed in AWS Secrets Manager, not in Terraform state
- Environment variables defined once in ConfigMap + Secrets

### Principle #10: Unified Typing Files

- All Kubernetes manifests share common labels via Kustomize
- Helm `_helpers.tpl` centralizes naming conventions
- Terraform variables and outputs are centralized

### Principle #11: Valkey (Docker) as Cache Layer

- ElastiCache Valkey 8 with replication, encryption, and backup
- Cache invalidation via tagged events from the application layer
- Valkey is the single cache source of truth

### Principle #12: Reduce Synchronization

- Each service manages its own state independently
- RDS is the single source of truth for data
- Valkey is the single source of truth for cache
- No shared mutable state between services

### Principle #14: AP as Default

- EKS node groups auto-scale based on metrics (availability over consistency)
- Liveness/readiness probes ensure unhealthy pods are replaced
- Multiple AZs for high availability

### Principle #15: Proactive Defense First

- Security groups restrict access to only necessary ports
- IAM roles follow least-privilege principle
- S3 buckets are private with CloudFront OAI access
- TLS is enforced at the Ingress level

## Deployment Environments

| Environment | Replicas (API) | Replicas (Web) | DB Instance | Node Type | Notes |
|-------------|----------------|----------------|-------------|-----------|-------|
| dev | 1 | 1 | db.t3.medium | t3.medium | Single AZ, minimal resources |
| staging | 2 | 2 | db.r6g.large | m6i.xlarge | Mirrors production |
| production | 5 | 5 | db.r6g.xlarge | m6i.2xlarge | Multi-AZ, full HA |

## CI/CD Pipeline

```
GitHub Actions Workflows:

1. ci.yml (existing) → Lint, test, build, security audit
2. deploy-dev.yml   → On push to `develop` branch
3. deploy-staging.yml → On push to `main` branch
4. deploy-production.yml → Manual trigger with approval
5. terraform.yml → Infrastructure provisioning
6. backup.yml → Daily backups (existing)
```

## Terraform Commands

```bash
# Initialize
terraform init

# Plan
terraform plan -var-file=environments/staging/terraform.tfvars

# Apply
terraform apply -var-file=environments/staging/terraform.tfvars

# Destroy
terraform destroy -var-file=environments/staging/terraform.tfvars

# State inspection
terraform state list
terraform show
```

## Kubernetes Commands

```bash
# Update kubeconfig
aws eks update-kubeconfig --name <cluster-name>

# Deploy
kustomize build overlays/staging | kubectl apply -f -

# Check status
kubectl get pods -n hakawi
kubectl get ingress -n hakawi
kubectl rollout status deployment/staging-backend -n hakawi

# Debug
kubectl logs -n hakawi deployment/staging-backend --tail=100
kubectl describe pod -n hakawi <pod-name>
```

## Helm Commands

```bash
# Deploy
helm upgrade --install backend ./helm/backend \
  --namespace hakawi \
  --set image.tag=v1.0.0 \
  --set env.NODE_ENV=production

# Lint
helm lint ./helm/backend

# Template
helm template backend ./helm/backend
```

## Secrets Management

All secrets are stored in **AWS Secrets Manager** and injected into pods as environment variables:

- `arn:aws:secretsmanager:<region>:<account>:secret:hakawi/production/backend/*`
- `arn:aws:secretsmanager:<region>:<account>:secret:hakawi/production/shared/*`

The backend ServiceAccount uses IRSA to access these secrets, ensuring no credentials
are written to Kubernetes manifests or Terraform state.