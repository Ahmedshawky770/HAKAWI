# WHY outputs moved here from main.tf: the module declared these same outputs twice
# (once in main.tf, once here), which is a hard `terraform validate` failure
# ("Duplicate output definition"). This file is now the single source of truth for the
# module's outputs (Principle #9).

output "primary_endpoint" {
  description = "Primary database endpoint (host:port — what the deploy workflows consume)"
  value       = aws_db_instance.primary.endpoint
}

# Bare hostname, no port. This is the value written to the `<prefix>/db/host` secret,
# because the app pairs the host with DB_PORT separately (backend/src/config/
# database.config.ts). The `primary_endpoint` output above keeps the host:port form that
# .github/workflows/deploy-*.yml consumes for `--set env.db.primaryHost=...`.
output "primary_address" {
  description = "Primary database hostname without port"
  value       = aws_db_instance.primary.address
}

output "primary_port" {
  description = "Primary database port"
  value       = aws_db_instance.primary.port
}

output "primary_arn" {
  description = "Primary database ARN"
  value       = aws_db_instance.primary.arn
}

output "replica_endpoints" {
  description = "Replica database endpoints (host:port)"
  value       = aws_db_instance.replica[*].endpoint
}

output "replica_addresses" {
  description = "Replica database hostnames without port (written to the db/replica-hosts secret)"
  value       = aws_db_instance.replica[*].address
}

output "replica_ports" {
  description = "Replica database ports"
  value       = aws_db_instance.replica[*].port
}

output "replica_arns" {
  description = "Replica database ARNs"
  value       = aws_db_instance.replica[*].arn
}

output "parameter_group_name" {
  description = "DB parameter group name"
  value       = aws_db_parameter_group.main.name
}

output "master_password" {
  description = "Master password (if generated)"
  value       = var.master_password != "" ? var.master_password : random_password.db_master.result
  sensitive   = true
}

# Secret ARNs — one output per Secrets Manager secret this module provisions, so the
# root module can re-export them and the deploy side can reference them without guessing
# resource addresses.
output "db_host_secret_arn" {
  description = "ARN of the <prefix>/db/host secret"
  value       = aws_secretsmanager_secret.db_host.arn
}

output "db_user_secret_arn" {
  description = "ARN of the <prefix>/db/user secret"
  value       = aws_secretsmanager_secret.db_user.arn
}

output "db_password_secret_arn" {
  description = "ARN of the <prefix>/db/password secret"
  value       = aws_secretsmanager_secret.db_password.arn
}

output "db_replica_hosts_secret_arn" {
  description = "ARN of the <prefix>/db/replica-hosts secret"
  value       = aws_secretsmanager_secret.db_replica_hosts.arn
}
