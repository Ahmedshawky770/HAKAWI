# Development Environment Configuration
environment = "dev"

aws_region = "us-east-1"

vpc_cidr = "10.0.0.0/16"

availability_zones = ["us-east-1a", "us-east-1b", "us-east-1c"]

private_subnets = ["10.0.1.0/24", "10.0.2.0/24", "10.0.3.0/24"]

public_subnets = ["10.0.101.0/24", "10.0.102.0/24", "10.0.103.0/24"]

# Database (RDS) and cache (Valkey) subnets — DEDICATED tiers, disjoint from the
# private/public subnets above. (The database tier used to be cidrsubnet() slices of the
# private /24s: overlapping CIDRs AWS rejects on apply.)
database_subnets = ["10.0.201.0/24", "10.0.202.0/24", "10.0.203.0/24"]
cache_subnets    = ["10.0.251.0/24", "10.0.252.0/24", "10.0.253.0/24"]

# Secrets Manager prefix — MUST match infrastructure/helm/backend/values.yaml
# externalSecrets.secretPrefix. WHY it is `hakawi/dev` and not the bare `hakawi`: the
# shared prefix put dev, staging and production in ONE Secrets Manager namespace, and the
# backend's IAM policy is `<prefix>/*`, so dev's role could read
# `hakawi/production/jwt/secret` (see infrastructure/terraform/main.tf locals and
# variables.tf). Every environment now gets its own tree; leaving this line out would
# produce exactly the value below (`hakawi/dev`) anyway.
secret_prefix = "hakawi/dev"

# No internal hosted zone in dev, so the module creates zero Route53 replica records
# (previously an empty zone ID here made every apply fail with replica_count >= 1).
route53_zone_id = ""

# Dev keeps the API endpoint reachable from developer machines and GitHub-hosted
# runners; there is no production data behind it. Staging/production use [] (private-only)
# and their tfvars record why that makes the GitHub-hosted runner path infeasible — each
# deploy workflow carries a reachability preflight for exactly this reason.
eks_cluster_endpoint_public_access_cidrs = ["0.0.0.0/0"]

# Smaller instances for dev
db_instance_class          = "db.t3.medium"
db_replica_instance_class  = "db.t3.medium"
db_allocated_storage       = 20
db_max_allocated_storage   = 100
db_multi_az                = false
db_backup_retention_period = 7
db_replica_count           = 1
db_master_password         = "dev-password-change-me"

cache_node_type = "cache.t3.medium"
cache_num_nodes = 1

# Valkey auth token — obvious dev value (16-128 chars). Empty would generate a random
# one; staging/production leave it empty and inject the real token out-of-band.
valkey_auth_token = "dev-only-valkey-token-not-for-production"

eks_node_instance_types = ["t3.medium"]
eks_desired_size        = 1
eks_min_size            = 1
eks_max_size            = 3

grafana_admin_password = "admin"

cors_allowed_origins = ["http://localhost:3000", "https://dev.hakawi.com"]

# ---------------------------------------------------------------------------
# Application secrets — DEV PLACEHOLDERS ONLY. None of these is a real credential;
# they exist so the Helm charts' ExternalSecrets have values to sync in dev. They are
# written to AWS Secrets Manager, never to source. Production rejects every one of these
# at boot (backend/src/config/*.config.ts fail closed on known placeholders).
# ---------------------------------------------------------------------------
jwt_secret            = "dev-only-jwt-secret-not-for-production-32"
jwt_refresh_secret    = "dev-only-refresh-secret-not-for-production-32"
encryption_key        = "dev-only-encryption-key-not-for-production-32"
paymob_api_key        = "sandbox-paymob-api-key"
paymob_merchant_id    = "sandbox-merchant-id"
paymob_integration_id = "sandbox-integration-id"
paymob_webhook_secret = "dev-only-paymob-webhook-secret-min-32"
sentry_dsn            = ""
# Not read by the app (IRSA is the credential path); kept for the chart contract.
s3_access_key = ""
s3_secret_key = ""
email_from    = "noreply@dev.hakawi.com"
# Matches infrastructure/helm/backend/values.yaml env.apiUrl default.
frontend_api_url = "https://api.hakawi.com/api/v1"

common_tags = {
  Project     = "hakawi"
  Environment = "dev"
  ManagedBy   = "terraform"
  Owner       = "platform-team"
  CostCenter  = "engineering"
}