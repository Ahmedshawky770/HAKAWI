# ElastiCache Module for Hakawi (Valkey)
# Creates a Valkey replication group with primary and replicas

resource "aws_elasticache_parameter_group" "main" {
  name        = "${var.environment}-hakawi-valkey-${var.engine_version}"
  family      = "valkey${replace(var.engine_version, "\\.", "")}"
  description = "Parameter group for Hakawi Valkey ${var.engine_version}"

  parameter {
    name  = "maxmemory-policy"
    value = "allkeys-lru"
  }

  parameter {
    name  = "timeout"
    value = "300"
  }

  parameter {
    name  = "tcp-keepalive"
    value = "60"
  }

  tags = merge(var.tags, {
    Name = "${var.environment}-hakawi-valkey-params"
  })
}

resource "aws_elasticache_subnet_group" "main" {
  name       = "${var.environment}-hakawi-cache-subnet-group"
  subnet_ids = var.private_subnet_ids

  tags = merge(var.tags, {
    Name = "${var.environment}-hakawi-cache-subnet-group"
  })
}

resource "aws_elasticache_replication_group" "main" {
  replication_group_id       = "${var.environment}-hakawi-valkey"
  replication_group_description = "Hakawi Valkey cluster for ${var.environment}"

  engine               = "valkey"
  engine_version       = var.engine_version
  port                 = var.port
  parameter_group_name = aws_elasticache_parameter_group.main.name
  node_type            = var.node_type
  number_cache_clusters = var.num_cache_nodes

  subnet_group_name    = aws_elasticache_subnet_group.main.name
  security_group_ids   = var.security_group_ids

  automatic_failover_enabled = true
  multi_az_enabled          = true
  at_rest_encryption_enabled = true
  transit_encryption_enabled = true
  auth_token_enabled        = true

  snapshot_retention_limit  = var.environment == "production" ? 30 : 7
  snapshot_window           = "03:00-04:00"
  maintenance_window        = "mon:04:00-mon:05:00"

  log_delivery_configuration {
    destination_type = "cloudwatch-logs"
    log_format       = "json"
    log_type         = "slow-log"
    destination_details {
      cloudwatch_logs {
        log_group = "/aws/elasticache/${var.environment}/hakawi-valkey/slow-log"
      }
    }
  }

  log_delivery_configuration {
    destination_type = "cloudwatch-logs"
    log_format       = "json"
    log_type         = "engine-log"
    destination_details {
      cloudwatch_logs {
        log_group = "/aws/elasticache/${var.environment}/hakawi-valkey/engine-log"
      }
    }
  }

  tags = merge(var.tags, {
    Name        = "${var.environment}-hakawi-valkey"
    Environment = var.environment
  })
}

resource "aws_cloudwatch_log_group" "valkey_slow" {
  name              = "/aws/elasticache/${var.environment}/hakawi-valkey/slow-log"
  retention_in_days = var.environment == "production" ? 30 : 7
  tags              = var.tags
}

resource "aws_cloudwatch_log_group" "valkey_engine" {
  name              = "/aws/elasticache/${var.environment}/hakawi-valkey/engine-log"
  retention_in_days = var.environment == "production" ? 30 : 7
  tags              = var.tags
}

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