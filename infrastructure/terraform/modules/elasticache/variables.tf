variable "environment" {
  description = "Environment name"
  type        = string
}

variable "vpc_id" {
  description = "VPC ID"
  type        = string
}

# Renamed from `private_subnets_ids`: the replication group now runs in the VPC module's
# dedicated CACHE subnets (the subnet group used to point at the private subnets). The
# rename keeps the variable name honest about which tier it carries; the root module
# passes `module.vpc.cache_subnet_ids`.
variable "cache_subnet_ids" {
  description = "Cache subnet IDs (dedicated ElastiCache/Valkey tier)"
  type        = list(string)
}

variable "security_group_ids" {
  description = "Security group IDs"
  type        = list(string)
}

variable "engine_version" {
  description = "Valkey engine version"
  type        = string
  default     = "8.0"
}

variable "node_type" {
  description = "Cache node type"
  type        = string
}

variable "num_cache_nodes" {
  description = "Number of cache nodes (primary + replicas)"
  type        = number
  default     = 2
}

variable "parameter_group_name" {
  description = "Parameter group name"
  type        = string
  default     = "default.valkey8"
}

variable "port" {
  description = "Valkey port"
  type        = number
  default     = 6379
}

# WHY auth_token is a variable: the replication group sets `auth_token_enabled = true`
# (transit encryption), and neither the AWS API nor the Terraform provider accepts that
# without an actual token — every apply failed with an invalid-parameter error before
# this existed. Empty means "generate one with random_password", mirroring how the RDS
# module treats `master_password`, so staging/production keep the "inject out-of-band"
# convention from their tfvars while still getting a working, non-empty token.
variable "auth_token" {
  description = "Valkey auth token (empty = generate a random 32-character token)"
  type        = string
  default     = ""
  sensitive   = true
}

# WHY secret_prefix: the Helm chart's ExternalSecret reads `<prefix>/valkey/host` and
# `<prefix>/valkey/password` from Secrets Manager and mounts them as VALKEY_HOST /
# VALKEY_PASSWORD (backend/src/config/valkey.config.ts). The prefix is passed from the
# root module so the paths written here and the paths the chart reads are decided in one
# place (Principle #9).
#
# WHY it must also be environment-scoped (`hakawi/<environment>`): the root default used to
# be a bare `"hakawi"` shared by every environment, which put every environment's Valkey
# auth token in one namespace. `aws_secretsmanager_secret.valkey_host` refuses a prefix
# without this environment as a path segment, so the mistake fails the plan.
variable "secret_prefix" {
  description = "AWS Secrets Manager path prefix for the Valkey secrets (must match the Helm chart externalSecrets.secretPrefix and be environment-scoped: hakawi/<environment>)"
  type        = string
}

variable "tags" {
  description = "Tags for all resources"
  type        = map(string)
  default     = {}
}