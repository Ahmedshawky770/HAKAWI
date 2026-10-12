variable "environment" {
  description = "Environment name"
  type        = string
}

variable "vpc_id" {
  description = "VPC ID"
  type        = string
}

variable "private_subnet_ids" {
  description = "Private subnet IDs"
  type        = list(string)
}

variable "db_subnet_group_name" {
  description = "DB subnet group name"
  type        = string
}

variable "security_group_ids" {
  description = "Security group IDs"
  type        = list(string)
}

variable "engine_version" {
  description = "PostgreSQL engine version"
  type        = string
  default     = "15.4"
}

variable "instance_class" {
  description = "Primary instance class"
  type        = string
}

variable "replica_instance_class" {
  description = "Replica instance class"
  type        = string
}

variable "allocated_storage" {
  description = "Initial allocated storage in GB"
  type        = number
}

variable "max_allocated_storage" {
  description = "Maximum allocated storage in GB"
  type        = number
}

variable "multi_az" {
  description = "Enable Multi-AZ"
  type        = bool
}

variable "backup_retention_period" {
  description = "Backup retention period in days"
  type        = number
}

variable "database_name" {
  description = "Database name"
  type        = string
  default     = "hakawi"
}

variable "master_username" {
  description = "Master username"
  type        = string
  default     = "postgres"
}

variable "master_password" {
  description = "Master password (empty to generate)"
  type        = string
  default     = ""
  sensitive   = true
}

variable "replica_count" {
  description = "Number of read replicas"
  type        = number
  default     = 2
}

variable "route53_zone_id" {
  description = "Route53 zone ID for internal DNS (empty = do not create replica CNAME records)"
  type        = string
  default     = ""
}

# WHY secret_prefix: the application reads its database credentials from AWS Secrets
# Manager through the ExternalSecret resources in infrastructure/helm/backend (paths
# `<prefix>/db/*`). The prefix is passed in from the root module so the secret paths this
# module writes and the paths the chart reads are decided in exactly one place. It is
# deliberately required rather than defaulted: a silent default that drifts from the
# chart's `externalSecrets.secretPrefix` is a boot failure that only shows up in the
# cluster (Principle #9).
#
# WHY it must also be environment-scoped (`hakawi/<environment>`): the default used to be
# the bare `"hakawi"` at the root, so every environment wrote `<prefix>/db/password` into
# ONE shared namespace and the backend's IAM policy was scoped to the same shared tree.
# `aws_secretsmanager_secret.db_host` refuses a prefix without this environment as a path
# segment, so the mistake fails the plan instead of the cluster.
variable "secret_prefix" {
  description = "AWS Secrets Manager path prefix for the database secrets (must match the Helm chart externalSecrets.secretPrefix and be environment-scoped: hakawi/<environment>)"
  type        = string
}

variable "tags" {
  description = "Tags for all resources"
  type        = map(string)
  default     = {}
}