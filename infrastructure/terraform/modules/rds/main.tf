# RDS Module for Hakawi
# Creates PostgreSQL primary instance with read replicas
# Includes automated backups, encryption, monitoring, and parameter groups

resource "random_password" "db_master" {
  length  = 32
  special = false
  override_special = "_"
}

resource "aws_db_parameter_group" "main" {
  name        = "${var.environment}-hakawi-db-pg15"
  family      = "postgres15"
  description = "Parameter group for Hakawi PostgreSQL 15"

  parameter {
    name  = "shared_preload_libraries"
    value = "pg_stat_statements,auto_explain"
  }

  parameter {
    name  = "pg_stat_statements.track"
    value = "all"
  }

  parameter {
    name  = "auto_explain.log_min_duration"
    value = "1000"
  }

  parameter {
    name  = "auto_explain.log_analyze"
    value = "on"
  }

  parameter {
    name  = "log_min_duration_statement"
    value = "1000"
  }

  parameter {
    name  = "log_statement"
    value = "ddl"
  }

  parameter {
    name  = "log_connections"
    value = "on"
  }

  parameter {
    name  = "log_disconnections"
    value = "on"
  }

  parameter {
    name  = "log_lock_waits"
    value = "on"
  }

  parameter {
    name  = "temp_file_limit"
    value = "10240"
  }

  parameter {
    name  = "max_connections"
    value = "300"
  }

  tags = merge(var.tags, {
    Name = "${var.environment}-hakawi-db-pg15"
  })
}

resource "aws_db_instance" "primary" {
  identifier                 = "${var.environment}-hakawi-primary"
  engine                     = "postgres"
  engine_version             = var.engine_version
  instance_class             = var.instance_class
  allocated_storage          = var.allocated_storage
  max_allocated_storage      = var.max_allocated_storage
  storage_encrypted          = true
  storage_type               = "gp3"
  iops                       = 3000
  db_subnet_group_name       = var.db_subnet_group_name
  vpc_security_group_ids     = var.security_group_ids
  parameter_group_name       = aws_db_parameter_group.main.name
  db_name                    = var.database_name
  username                   = var.master_username
  password                   = var.master_password != "" ? var.master_password : random_password.db_master.result
  port                       = 5432
  multi_az                   = var.multi_az
  publicly_accessible        = false
  backup_retention_period    = var.backup_retention_period
  backup_window              = "03:00-04:00"
  maintenance_window         = "mon:04:00-mon:05:00"
  skip_final_snapshot        = var.environment == "dev"
  deletion_protection        = var.environment == "production"
  copy_tags_to_snapshot      = true
  monitoring_interval        = 60
  monitoring_role_arn        = aws_iam_role.rds_monitoring.arn
  performance_insights_enabled = true
  performance_insights_retention_period = 7
  enable_cloudwatch_logs_exports = ["postgresql", "upgrade"]

  tags = merge(var.tags, {
    Name        = "${var.environment}-hakawi-primary"
    Role        = "primary"
    Environment = var.environment
  })

  lifecycle {
    ignore_changes = [
      password,
    ]
  }
}

resource "aws_db_instance" "replica" {
  count                    = var.replica_count
  identifier               = "${var.environment}-hakawi-replica-${count.index + 1}"
  replicate_source_db      = aws_db_instance.primary.identifier
  instance_class           = var.replica_instance_class
  storage_encrypted        = true
  db_subnet_group_name     = var.db_subnet_group_name
  vpc_security_group_ids   = var.security_group_ids
  parameter_group_name     = aws_db_parameter_group.main.name
  publicly_accessible      = false
  monitoring_interval      = 60
  monitoring_role_arn      = aws_iam_role.rds_monitoring.arn
  performance_insights_enabled = true
  performance_insights_retention_period = 7
  enable_cloudwatch_logs_exports = ["postgresql"]
  deletion_protection      = var.environment == "production"

  tags = merge(var.tags, {
    Name        = "${var.environment}-hakawi-replica-${count.index + 1}"
    Role        = "replica"
    Environment = var.environment
  })
}

resource "aws_iam_role" "rds_monitoring" {
  name = "${var.environment}-hakawi-rds-monitoring"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "monitoring.rds.amazonaws.com"
      }
    }]
  })
}

resource "aws_iam_role_policy_attachment" "rds_monitoring" {
  role       = aws_iam_role.rds_monitoring.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonRDSEnhancedMonitoringRole"
}

# Read Replica DNS Records (for application routing)
# WHY the count guard: `zone_id = var.route53_zone_id` defaulted to "", so with
# replica_count >= 1 every apply sent an empty zone ID to the Route53 API and was
# rejected — the resource could never be created successfully. The module's own
# convention for optional resources is a count guard (`aws_db_instance.replica` does
# exactly this), so the guard is: create one record per replica ONLY when a zone ID was
# actually provided. An environment that has no internal hosted zone sets
# `route53_zone_id = ""` in its tfvars and gets zero records; the day a zone exists,
# setting the variable creates them without a code change.
resource "aws_route53_record" "replica" {
  count = var.route53_zone_id != "" ? var.replica_count : 0

  zone_id = var.route53_zone_id
  name    = "db-replica-${count.index + 1}.${var.environment}.internal"
  type    = "CNAME"
  ttl     = 60
  records = [aws_db_instance.replica[count.index].endpoint]
}

# ============================================================================
# Database secrets for the application
#
# WHY these exist here: the master password used to be generated (or accepted) and used
# for `aws_db_instance.primary.password`, and then stored nowhere the application could
# read it. The Helm chart's ExternalSecret reads `<prefix>/db/password` (with
# `property: password`), `<prefix>/db/host`, `<prefix>/db/user` and
# `<prefix>/db/replica-hosts` from Secrets Manager and mounts them into the pods as
# DB_HOST / DB_USER / DB_PASSWORD / DB_REPLICA_HOSTS (backend/src/config/database.config.ts
# validates those names). Without these resources the ExternalSecret has nothing to sync
# and the backend cannot start.
#
# SHAPE NOTE: only the password secret is JSON (`{"password": ...}`) because that is the
# one remoteRef that sets `property`; every other remoteRef reads the whole secret value,
# so those are plain strings. host/replica-hosts carry the BARE hostname — RDS endpoint
# attributes include ":5432", and the app pairs the host with DB_PORT/DB_REPLICA_PORT
# separately (database.config.ts), so a port embedded here would break resolution.
#
# PRODUCTION VALUES ARE INJECTED OUT-OF-BAND (Principle #4): the values written here come
# from variables; staging and production declare them empty in tfvars and the real ones
# are supplied at apply time (GitHub secret / TF_VAR_). An empty `db_master_password`
# makes this module generate a random one via `random_password.db_master` and store THAT
# in the secret — the same generation path the instance itself uses, so the app always
# sees the real credential.
# ============================================================================
resource "aws_secretsmanager_secret" "db_host" {
  name                    = "${var.secret_prefix}/db/host"
  description             = "Hakawi ${var.environment} primary database host (bare hostname, no port)"
  recovery_window_in_days = var.environment == "production" ? 30 : 0

  tags = merge(var.tags, {
    Name = "${var.secret_prefix}/db/host"
  })

  # WHY THIS PRECONDITION: the prefix decides the namespace these secrets are written into,
  # and the default used to be a bare `"hakawi"` shared by every environment — so one
  # environment's apply could overwrite another's `<prefix>/db/password` (and the backend
  # IAM policy would have been scoped to the same shared tree). A prefix that does not carry
  # `var.environment` as a path segment fails the plan here instead. It is a lifecycle
  # precondition rather than a `variable` validation because it reads another variable,
  # which Terraform < 1.9 rejects (root `required_version = ">= 1.6.0"`).
  lifecycle {
    precondition {
      condition     = length(regexall("/(${var.environment})(/|$)", var.secret_prefix)) > 0
      error_message = "secret_prefix must be environment-scoped (\"hakawi/<environment>\"): the database secrets are written as <secret_prefix>/db/*, and a shared or foreign prefix points this environment's database credentials at another environment's paths. Got \"${var.secret_prefix}\" for environment \"${var.environment}\"."
    }
  }
}

resource "aws_secretsmanager_secret_version" "db_host" {
  secret_id     = aws_secretsmanager_secret.db_host.id
  secret_string = aws_db_instance.primary.address
}

resource "aws_secretsmanager_secret" "db_user" {
  name                    = "${var.secret_prefix}/db/user"
  description             = "Hakawi ${var.environment} database master username"
  recovery_window_in_days = var.environment == "production" ? 30 : 0

  tags = merge(var.tags, {
    Name = "${var.secret_prefix}/db/user"
  })
}

resource "aws_secretsmanager_secret_version" "db_user" {
  secret_id     = aws_secretsmanager_secret.db_user.id
  secret_string = var.master_username
}

resource "aws_secretsmanager_secret" "db_password" {
  name                    = "${var.secret_prefix}/db/password"
  description             = "Hakawi ${var.environment} database master password (JSON: property 'password')"
  recovery_window_in_days = var.environment == "production" ? 30 : 0

  tags = merge(var.tags, {
    Name = "${var.secret_prefix}/db/password"
  })
}

# JSON because the chart's ExternalSecret reads this one with `property: password`:
# `{"password": "..."}`. The same resolved password that `aws_db_instance.primary`
# uses (explicit variable, else the generated one), so the app and the instance can
# never drift apart.
resource "aws_secretsmanager_secret_version" "db_password" {
  secret_id     = aws_secretsmanager_secret.db_password.id
  secret_string = jsonencode({
    password = var.master_password != "" ? var.master_password : random_password.db_master.result
  })
}

resource "aws_secretsmanager_secret" "db_replica_hosts" {
  name                    = "${var.secret_prefix}/db/replica-hosts"
  description             = "Hakawi ${var.environment} comma-separated read-replica hostnames (no ports)"
  recovery_window_in_days = var.environment == "production" ? 30 : 0

  tags = merge(var.tags, {
    Name = "${var.secret_prefix}/db/replica-hosts"
  })
}

# Empty string when replica_count = 0: the backend treats an empty DB_REPLICA_HOSTS as
# "single instance" (database.config.ts hasReplicas), which is exactly right.
resource "aws_secretsmanager_secret_version" "db_replica_hosts" {
  secret_id     = aws_secretsmanager_secret.db_replica_hosts.id
  secret_string = join(",", aws_db_instance.replica[*].address)
}