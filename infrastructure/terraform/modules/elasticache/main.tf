# ElastiCache Module for Hakawi (Valkey)
# Creates a Valkey replication group with primary and replicas

# WHY this exists: `auth_token_enabled = true` with no token anywhere is rejected by the
# ElastiCache API (and the provider), so the replication group could never be created.
# The pattern matches modules/rds: an explicit variable wins, an empty one generates a
# random 32-character token. No special characters, because the Valkey AUTH token rules
# are stricter than a generic password and this keeps the value safe for both.
resource "random_password" "valkey_auth" {
  length  = 32
  special = false
}

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

# WHY the subnet group lives HERE and not in modules/vpc: modules/vpc used to declare an
# `aws_elasticache_subnet_group` with the SAME name from its private subnets while this
# module declared another one from its own variable — two resources racing to create the
# same AWS resource name means one apply fails with "SubnetGroupAlreadyExists". The
# module that consumes the group owns it; modules/vpc now only produces the dedicated
# cache subnets (`module.vpc.cache_subnet_ids`) this group is built from.
resource "aws_elasticache_subnet_group" "main" {
  name       = "${var.environment}-hakawi-cache-subnet-group"
  subnet_ids = var.cache_subnet_ids

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
  # Resolved once and used for both the API argument and the secret below, so the value
  # the application reads can never differ from the value the cluster enforces.
  auth_token                = var.auth_token != "" ? var.auth_token : random_password.valkey_auth.result

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

# ============================================================================
# Valkey connection secrets for the application
#
# WHY: the chart's ExternalSecret reads `<prefix>/valkey/host` and
# `<prefix>/valkey/password` (whole-value remoteRefs, so both are plain strings) and
# mounts them as VALKEY_HOST / VALKEY_PASSWORD, which backend/src/config/valkey.config.ts
# validates. The host must be the BARE hostname — the app pairs it with VALKEY_PORT, so
# a port embedded in the host value would break resolution.
#
# PRODUCTION VALUES ARE INJECTED OUT-OF-BAND (Principle #4): `auth_token` comes from a
# variable; staging/production declare it empty and supply the real token at apply time
# (GitHub secret / TF_VAR_). An empty variable makes this module generate a random token
# — the same one the replication group enforces — so the app and the cluster cannot drift.
# ============================================================================
resource "aws_secretsmanager_secret" "valkey_host" {
  name                    = "${var.secret_prefix}/valkey/host"
  description             = "Hakawi ${var.environment} Valkey primary endpoint (bare hostname, no port)"
  recovery_window_in_days = var.environment == "production" ? 30 : 0

  tags = merge(var.tags, {
    Name = "${var.secret_prefix}/valkey/host"
  })

  # WHY THIS PRECONDITION: same reason as modules/rds — the prefix is the namespace these
  # secrets are written into, it used to default to a bare `"hakawi"` shared by every
  # environment, and a shared namespace means one environment's apply can point its Valkey
  # credentials at another environment's paths. A prefix that does not carry
  # `var.environment` as a path segment fails the plan. Lifecycle precondition rather than a
  # `variable` validation because it reads another variable (Terraform < 1.9).
  lifecycle {
    precondition {
      condition     = length(regexall("/(${var.environment})(/|$)", var.secret_prefix)) > 0
      error_message = "secret_prefix must be environment-scoped (\"hakawi/<environment>\"): the Valkey secrets are written as <secret_prefix>/valkey/*, and a shared or foreign prefix points this environment's cache credentials at another environment's paths. Got \"${var.secret_prefix}\" for environment \"${var.environment}\"."
    }
  }
}

resource "aws_secretsmanager_secret_version" "valkey_host" {
  secret_id     = aws_secretsmanager_secret.valkey_host.id
  secret_string = aws_elasticache_replication_group.main.primary_endpoint_address
}

resource "aws_secretsmanager_secret" "valkey_password" {
  name                    = "${var.secret_prefix}/valkey/password"
  description             = "Hakawi ${var.environment} Valkey auth token"
  recovery_window_in_days = var.environment == "production" ? 30 : 0

  tags = merge(var.tags, {
    Name = "${var.secret_prefix}/valkey/password"
  })
}

resource "aws_secretsmanager_secret_version" "valkey_password" {
  secret_id     = aws_secretsmanager_secret.valkey_password.id
  secret_string = var.auth_token != "" ? var.auth_token : random_password.valkey_auth.result
}