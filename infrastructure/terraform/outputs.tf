output "vpc_id" {
  description = "VPC ID"
  value       = module.vpc.vpc_id
}

output "vpc_cidr" {
  description = "VPC CIDR block"
  value       = module.vpc.vpc_cidr
}

output "private_subnet_ids" {
  description = "Private subnet IDs"
  value       = module.vpc.private_subnet_ids
}

output "public_subnet_ids" {
  description = "Public subnet IDs"
  value       = module.vpc.public_subnet_ids
}

output "database_security_group_id" {
  description = "Database security group ID"
  value       = module.vpc.database_security_group_id
}

# The new dedicated tiers, one output per tier so the VPC CIDR plan is verifiable from
# the state alone.
output "database_subnet_ids" {
  description = "Database (RDS) subnet IDs"
  value       = module.vpc.database_subnet_ids
}

output "cache_subnet_ids" {
  description = "Cache (Valkey) subnet IDs"
  value       = module.vpc.cache_subnet_ids
}

output "cache_security_group_id" {
  description = "Cache security group ID"
  value       = module.vpc.cache_security_group_id
}

output "cluster_security_group_id" {
  description = "EKS cluster security group ID"
  value       = module.vpc.cluster_security_group_id
}

output "rds_primary_endpoint" {
  description = "RDS primary endpoint (host:port)"
  value       = module.rds.primary_endpoint
}

# Bare hostname (no ":5432"). The secret `<prefix>/db/host` carries this form because the
# app pairs the host with DB_PORT (backend/src/config/database.config.ts); a host value
# with the port embedded fails DNS resolution. The `rds_primary_endpoint` output above
# keeps the host:port form the deploy workflows consume for `--set env.db.primaryHost`.
output "rds_primary_address" {
  description = "RDS primary hostname without port"
  value       = module.rds.primary_address
}

output "rds_primary_port" {
  description = "RDS primary port"
  value       = module.rds.primary_port
}

output "rds_replica_endpoints" {
  description = "RDS replica endpoints (host:port)"
  value       = module.rds.replica_endpoints
}

output "rds_replica_addresses" {
  description = "RDS replica hostnames without port (comma-join these for DB_REPLICA_HOSTS)"
  value       = module.rds.replica_addresses
}

output "rds_replica_ports" {
  description = "RDS replica ports"
  value       = module.rds.replica_ports
}

output "elasticache_primary_endpoint" {
  description = "ElastiCache primary endpoint"
  value       = module.elasticache.primary_endpoint
}

output "elasticache_replica_endpoints" {
  description = "ElastiCache replica endpoints"
  value       = module.elasticache.replica_endpoints
}

output "elasticache_port" {
  description = "ElastiCache port"
  value       = module.elasticache.port
}

output "s3_bucket_name" {
  description = "S3 bucket name"
  value       = module.s3.bucket_name
}

output "s3_bucket_arn" {
  description = "S3 bucket ARN"
  value       = module.s3.bucket_arn
}

output "eks_cluster_name" {
  description = "EKS cluster name"
  value       = module.eks.cluster_name
}

output "eks_cluster_endpoint" {
  description = "EKS cluster endpoint"
  value       = module.eks.cluster_endpoint
}

output "eks_cluster_arn" {
  description = "EKS cluster ARN"
  value       = module.eks.cluster_arn
}

output "eks_oidc_provider_arn" {
  description = "EKS OIDC provider ARN"
  value       = module.eks.oidc_provider_arn
}

output "eks_oidc_provider_url" {
  description = "EKS OIDC provider URL"
  value       = module.eks.oidc_provider_url
}

# ============================================================================
# IRSA role ARN for the deploy side
#
# This is the ARN the backend ServiceAccount must be annotated with. The deploy workflows
# already reference the convention
#   `arn:aws:iam::<account>:role/hakawi-<env>-hakawi-backend-irsa`
# (e.g. `--set serviceAccount.annotations.eks\.amazonaws\.com/role-arn=<ARN>` in
# .github/workflows/deploy-{dev,staging,production}.yml, and the same shape appears as the
# placeholder in infrastructure/helm/backend/values-{staging,production}.yaml). The role
# name follows that convention, and the trust policy trusts
# `system:serviceaccount:hakawi:hakawi-backend` — the exact namespace/SA the chart
# deploys — so the annotation, the trust policy and the chart now agree.
# ============================================================================
output "eks_backend_irsa_role_arn" {
  description = "Backend ServiceAccount IRSA role ARN (arn:aws:iam::<account>:role/hakawi-<env>-hakawi-backend-irsa)"
  value       = module.iam.backend_role_arn
}

output "eks_backend_irsa_role_name" {
  description = "Backend ServiceAccount IRSA role name (hakawi-<env>-hakawi-backend-irsa)"
  value       = module.iam.backend_role_name
}

# ============================================================================
# Secrets Manager ARNs — one output per secret the Helm charts' ExternalSecrets read.
# The deploy side can use these to audit/diagnose without guessing resource addresses.
# ============================================================================

output "secret_prefix" {
  description = "AWS Secrets Manager path prefix this environment's secrets live under (hakawi/<environment> unless overridden)"
  value       = local.secret_prefix
}

output "secret_arn_db_host" {
  description = "ARN of the <prefix>/db/host secret"
  value       = module.rds.db_host_secret_arn
}

output "secret_arn_db_user" {
  description = "ARN of the <prefix>/db/user secret"
  value       = module.rds.db_user_secret_arn
}

output "secret_arn_db_password" {
  description = "ARN of the <prefix>/db/password secret (JSON property 'password')"
  value       = module.rds.db_password_secret_arn
}

output "secret_arn_db_replica_hosts" {
  description = "ARN of the <prefix>/db/replica-hosts secret"
  value       = module.rds.db_replica_hosts_secret_arn
}

output "secret_arn_valkey_host" {
  description = "ARN of the <prefix>/valkey/host secret"
  value       = module.elasticache.valkey_host_secret_arn
}

output "secret_arn_valkey_password" {
  description = "ARN of the <prefix>/valkey/password secret"
  value       = module.elasticache.valkey_password_secret_arn
}

output "secret_arn_jwt_secret" {
  description = "ARN of the <prefix>/jwt/secret secret"
  value       = module.secrets.jwt_secret_arn
}

output "secret_arn_jwt_refresh_secret" {
  description = "ARN of the <prefix>/jwt/refresh-secret secret"
  value       = module.secrets.jwt_refresh_secret_arn
}

output "secret_arn_encryption_key" {
  description = "ARN of the <prefix>/encryption/key secret"
  value       = module.secrets.encryption_key_secret_arn
}

output "secret_arn_paymob_api_key" {
  description = "ARN of the <prefix>/paymob/api-key secret"
  value       = module.secrets.paymob_api_key_secret_arn
}

output "secret_arn_paymob_merchant_id" {
  description = "ARN of the <prefix>/paymob/merchant-id secret"
  value       = module.secrets.paymob_merchant_id_secret_arn
}

output "secret_arn_paymob_integration_id" {
  description = "ARN of the <prefix>/paymob/integration-id secret"
  value       = module.secrets.paymob_integration_id_secret_arn
}

output "secret_arn_paymob_webhook_secret" {
  description = "ARN of the <prefix>/paymob/webhook-secret secret"
  value       = module.secrets.paymob_webhook_secret_arn
}

output "secret_arn_sentry_dsn" {
  description = "ARN of the <prefix>/sentry/dsn secret"
  value       = module.secrets.sentry_dsn_secret_arn
}

output "secret_arn_s3_access_key" {
  description = "ARN of the <prefix>/s3/access-key secret"
  value       = module.secrets.s3_access_key_secret_arn
}

output "secret_arn_s3_secret_key" {
  description = "ARN of the <prefix>/s3/secret-key secret"
  value       = module.secrets.s3_secret_key_arn
}

output "secret_arn_email_from" {
  description = "ARN of the <prefix>/email/from secret"
  value       = module.secrets.email_from_secret_arn
}

output "secret_arn_frontend_api_url" {
  description = "ARN of the <prefix>/frontend/api-url secret"
  value       = module.secrets.frontend_api_url_secret_arn
}

output "monitoring_prometheus_url" {
  description = "Prometheus URL"
  value       = module.monitoring.prometheus_url
}

output "monitoring_grafana_url" {
  description = "Grafana URL"
  value       = module.monitoring.grafana_url
}

output "monitoring_alertmanager_url" {
  description = "Alertmanager URL"
  value       = module.monitoring.alertmanager_url
}