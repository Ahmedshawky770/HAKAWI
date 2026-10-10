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