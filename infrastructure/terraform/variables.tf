variable "aws_region" {
  description = "AWS region for all resources"
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Environment name (dev, staging, production)"
  type        = string
  validation {
    condition     = contains(["dev", "staging", "production"], var.environment)
    error_message = "Environment must be dev, staging, or production."
  }
}

variable "vpc_cidr" {
  description = "CIDR block for VPC"
  type        = string
  default     = "10.0.0.0/16"
}

variable "availability_zones" {
  description = "Availability zones to use"
  type        = list(string)
  default     = ["us-east-1a", "us-east-1b", "us-east-1c"]
}

variable "private_subnets" {
  description = "Private subnet CIDR blocks"
  type        = list(string)
  default     = ["10.0.1.0/24", "10.0.2.0/24", "10.0.3.0/24"]
}

variable "public_subnets" {
  description = "Public subnet CIDR blocks"
  type        = list(string)
  default     = ["10.0.101.0/24", "10.0.102.0/24", "10.0.103.0/24"]
}

# WHY these exist as explicit inputs: the database subnets used to be carved out of the
# private /24s with cidrsubnet() (newbits 4, offsets 10-12), which places the /28s INSIDE
# the private /24s — overlapping CIDRs that AWS rejects on apply. The cache tier ran in
# the private subnets with no boundary of its own. Both are now explicit per-environment
# lists, and the four tiers are disjoint by construction:
#   private  10.<x>.1-3.0/24    (EKS nodes, apps)
#   public   10.<x>.101-103.0/24 (ALB, NAT)
#   database 10.<x>.201-203.0/24 (RDS)
#   cache    10.<x>.251-253.0/24 (Valkey)
# where <x> is the per-environment second octet (0=dev, 1=staging, 2=production). Each
# environment's tfvars states its actual layout (Principle #9 — one readable place for
# the address plan).
variable "database_subnets" {
  description = "Database subnet CIDR blocks (RDS) - disjoint from public/private/cache"
  type        = list(string)
  default     = ["10.0.201.0/24", "10.0.202.0/24", "10.0.203.0/24"]
}

variable "cache_subnets" {
  description = "Cache subnet CIDR blocks (ElastiCache/Valkey) - disjoint from public/private/database"
  type        = list(string)
  default     = ["10.0.251.0/24", "10.0.252.0/24", "10.0.253.0/24"]
}

variable "common_tags" {
  description = "Common tags for all resources"
  type        = map(string)
  default     = {}
}

# Database Configuration
variable "db_instance_class" {
  description = "RDS instance class for primary"
  type        = string
  default     = "db.r6g.xlarge"
}

variable "db_replica_instance_class" {
  description = "RDS instance class for replicas"
  type        = string
  default     = "db.r6g.large"
}

variable "db_allocated_storage" {
  description = "Initial allocated storage in GB"
  type        = number
  default     = 100
}

variable "db_max_allocated_storage" {
  description = "Maximum allocated storage in GB"
  type        = number
  default     = 500
}

variable "db_multi_az" {
  description = "Enable Multi-AZ deployment"
  type        = bool
  default     = true
}

variable "db_backup_retention_period" {
  description = "Backup retention period in days"
  type        = number
  default     = 30
}

variable "db_replica_count" {
  description = "Number of read replicas"
  type        = number
  default     = 2
}

variable "db_master_password" {
  description = "Master password for RDS"
  type        = string
  sensitive   = true
}

# Route53 zone for the internal replica CNAMEs. Empty (no default breakage: the module
# guards with `count`) means this environment has no internal hosted zone, so no records
# are created. The module's convention for optional resources is a count guard, and an
# empty zone ID used to reach the API on apply when replica_count >= 1 — an instant
# InvalidZoneId failure.
variable "route53_zone_id" {
  description = "Route53 zone ID for internal replica DNS (empty = do not create replica records)"
  type        = string
  default     = ""
}

# AWS Secrets Manager path prefix — MUST equal the Helm charts'
# `externalSecrets.secretPrefix`:
#   dev       -> "hakawi/dev"            (infrastructure/helm/backend/values.yaml default)
#   staging   -> "hakawi/staging"        (values-staging.yaml)
#   production-> "hakawi/production"     (values-production.yaml)
# Every secrets-writing module and the backend's IAM policy are scoped from this one
# variable, which is what keeps the chart contract and the infrastructure in step
# (Principle #9).
#
# WHY THERE IS NO FLAT DEFAULT ANY MORE. The default used to be the bare `"hakawi"`, i.e.
# ONE PREFIX SHARED BY EVERY ENVIRONMENT IN THE ACCOUNT. The backend's IAM policy resource
# is `<prefix>/*` (modules/iam), so that prefix made dev's role able to read
# `hakawi/production/jwt/secret` and `hakawi/staging/db/password` — production's live
# payment credentials reached from a throwaway cluster. The default is now derived from
# `var.environment` (`hakawi/<environment>`, see `locals` in main.tf), so an environment
# cannot name another environment's secrets even by accident, and each module additionally
# refuses a prefix that does not carry its own environment as a path segment. Override it
# only to move the whole tree (e.g. `hakawi/eu/production`), never to share a prefix.
variable "secret_prefix" {
  description = "AWS Secrets Manager path prefix matching the Helm charts' externalSecrets.secretPrefix (empty = \"hakawi/<environment>\")"
  type        = string
  default     = ""
}

# Cache Configuration
variable "cache_node_type" {
  description = "ElastiCache node type"
  type        = string
  default     = "cache.r6g.large"
}

variable "cache_num_nodes" {
  description = "Number of cache nodes"
  type        = number
  default     = 2
}

# Valkey auth token. WHY it exists: the replication group sets
# `auth_token_enabled = true` with transit encryption, and creating it with no token is
# rejected — every apply failed before this variable existed. Empty (the default) makes
# the module generate a random 32-character token, so staging/production keep the
# inject-out-of-band convention yet still get a working, non-empty credential
# (Principle #4).
variable "valkey_auth_token" {
  description = "Valkey auth token (empty = generate a random 32-character token)"
  type        = string
  default     = ""
  sensitive   = true
}

# EKS Configuration
variable "eks_node_instance_types" {
  description = "EKS node group instance types"
  type        = list(string)
  default     = ["m6i.xlarge"]
}

variable "eks_desired_size" {
  description = "Desired number of EKS nodes"
  type        = number
  default     = 3
}

variable "eks_min_size" {
  description = "Minimum number of EKS nodes"
  type        = number
  default     = 2
}

variable "eks_max_size" {
  description = "Maximum number of EKS nodes"
  type        = number
  default     = 10
}

# Kubernetes API server endpoint restriction. WHY: the EKS module used to hardcode
# `public_access_cidrs = ["0.0.0.0/0"]` — the cluster control plane open to the entire
# internet. The empty default is the hardened posture (public endpoint answers nobody).
# dev overrides this with 0.0.0.0/0 in its tfvars because developer machines and
# GitHub-hosted runners need to reach the throwaway dev cluster; staging and production
# keep [] and take cluster access from inside the VPN/VPC (Principle #15).
#
# WHY `[]` HAS AN OPERATIONAL PRICE THAT IS DOCUMENTED, NOT HIDDEN: with no public CIDRs the
# Kubernetes API server answers nobody outside the VPC, so a deploy from a GitHub-hosted
# runner times out at `update-kubeconfig`/`helm`. Each deploy workflow therefore runs a
# reachability preflight BEFORE the apply (and names the two supported paths: a self-hosted
# runner inside the VPC, or a temporary, documented CIDR entry). Do not widen this list to
# 0.0.0.0/0 or to GitHub's published ranges to make a pipeline green — see
# modules/eks/variables.tf and the tfvars comments.
variable "eks_cluster_endpoint_public_access_cidrs" {
  description = "CIDR blocks allowed to reach the EKS public API endpoint (empty = private-only; deploys from GitHub-hosted runners then require a self-hosted in-VPC runner)"
  type        = list(string)
  default     = []
}

# Monitoring
variable "grafana_admin_password" {
  description = "Grafana admin password"
  type        = string
  sensitive   = true
}

# CORS
variable "cors_allowed_origins" {
  description = "Allowed CORS origins for S3"
  type        = list(string)
  default     = ["https://app.hakawi.com", "https://staging.hakawi.com"]
}

# ============================================================================
# Application Secrets (written to AWS Secrets Manager by module "secrets",
# modules/rds and modules/elasticache — never stored in this repository)
#
# CONVENTION (matches db_master_password / grafana_admin_password above):
#   * dev        carries obvious, dev-only placeholder values in its tfvars
#   * staging/production declare "" and inject the real values out-of-band at apply time
#     (GitHub secret exposed as TF_VAR_*, Principle #4)
# An empty jwt/encryption value makes module "secrets" generate a strong random secret
# via random_password and store THAT in Secrets Manager, so a forgotten variable can
# never leave the application booting with a weak or publicly known key. The backend
# refuses publicly known placeholders at boot in production, so anything that slips
# through fails closed.
# ============================================================================

variable "jwt_secret" {
  description = "JWT signing secret (empty = generate random). Production: inject out-of-band."
  type        = string
  default     = ""
  sensitive   = true
}

variable "jwt_refresh_secret" {
  description = "Refresh-token signing secret (empty = generate random). Production: inject out-of-band."
  type        = string
  default     = ""
  sensitive   = true
}

variable "encryption_key" {
  description = "Encryption key for password-reset tokens (empty = generate random). NOT rotatable once set."
  type        = string
  default     = ""
  sensitive   = true
}

variable "paymob_api_key" {
  description = "Paymob API key. Production: inject out-of-band (the app refuses published placeholders)."
  type        = string
  default     = ""
  sensitive   = true
}

variable "paymob_merchant_id" {
  description = "Paymob merchant ID. Production: inject out-of-band."
  type        = string
  default     = ""
  sensitive   = true
}

variable "paymob_integration_id" {
  description = "Paymob integration ID. Production: inject out-of-band."
  type        = string
  default     = ""
  sensitive   = true
}

variable "paymob_webhook_secret" {
  description = "Paymob webhook secret (min 32 chars or webhooks are rejected unsigned). Production: inject out-of-band."
  type        = string
  default     = ""
  sensitive   = true
}

variable "sentry_dsn" {
  description = "Sentry DSN (empty = the Sentry integration stays a no-op)"
  type        = string
  default     = ""
  sensitive   = true
}

variable "s3_access_key" {
  description = "Placeholder S3 access key for the chart contract; the app authenticates via IRSA and does not read it."
  type        = string
  default     = ""
  sensitive   = true
}

variable "s3_secret_key" {
  description = "Placeholder S3 secret key for the chart contract; the app authenticates via IRSA and does not read it."
  type        = string
  default     = ""
  sensitive   = true
}

variable "email_from" {
  description = "From address for outbound mail (mounted as EMAIL_FROM)"
  type        = string
}

variable "frontend_api_url" {
  description = "Public API URL the frontend calls (mounted as NEXT_PUBLIC_API_URL)"
  type        = string
}