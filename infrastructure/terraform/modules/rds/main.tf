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
resource "aws_route53_record" "replica" {
  count   = var.replica_count
  zone_id = var.route53_zone_id
  name    = "db-replica-${count.index + 1}.${var.environment}.internal"
  type    = "CNAME"
  ttl     = 60
  records = [aws_db_instance.replica[count.index].endpoint]
}

output "primary_endpoint" {
  description = "Primary database endpoint"
  value       = aws_db_instance.primary.endpoint
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
  description = "Replica database endpoints"
  value       = aws_db_instance.replica[*].endpoint
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