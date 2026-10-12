# WHY outputs moved here from main.tf: the module declared these same outputs twice
# (once in main.tf, once here), which is a hard `terraform validate` failure
# ("Duplicate output definition"). This file is now the single source of truth.

output "primary_endpoint" {
  description = "Primary endpoint"
  value       = aws_elasticache_replication_group.main.primary_endpoint_address
}

output "replica_endpoints" {
  description = "Replica endpoints (reader endpoint)"
  value       = [aws_elasticache_replication_group.main.reader_endpoint_address]
}

output "port" {
  description = "Valkey port"
  value       = aws_elasticache_replication_group.main.port
}

output "configuration_endpoint" {
  description = "Configuration endpoint"
  value       = aws_elasticache_replication_group.main.configuration_endpoint_address
}

output "replication_group_id" {
  description = "Replication group ID"
  value       = aws_elasticache_replication_group.main.replication_group_id
}

output "member_clusters" {
  description = "Member cluster IDs"
  value       = aws_elasticache_replication_group.main.member_clusters
}

output "auth_token" {
  description = "Valkey auth token (resolved: explicit variable or generated)"
  value       = var.auth_token != "" ? var.auth_token : random_password.valkey_auth.result
  sensitive   = true
}

output "valkey_host_secret_arn" {
  description = "ARN of the <prefix>/valkey/host secret"
  value       = aws_secretsmanager_secret.valkey_host.arn
}

output "valkey_password_secret_arn" {
  description = "ARN of the <prefix>/valkey/password secret"
  value       = aws_secretsmanager_secret.valkey_password.arn
}
