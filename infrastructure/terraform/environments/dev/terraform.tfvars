# Development Environment Configuration
environment = "dev"

aws_region = "us-east-1"

vpc_cidr = "10.0.0.0/16"

availability_zones = ["us-east-1a", "us-east-1b", "us-east-1c"]

private_subnets = ["10.0.1.0/24", "10.0.2.0/24", "10.0.3.0/24"]

public_subnets = ["10.0.101.0/24", "10.0.102.0/24", "10.0.103.0/24"]

# Smaller instances for dev
db_instance_class = "db.t3.medium"
db_replica_instance_class = "db.t3.medium"
db_allocated_storage = 20
db_max_allocated_storage = 100
db_multi_az = false
db_backup_retention_period = 7
db_replica_count = 1
db_master_password = "dev-password-change-me"

cache_node_type = "cache.t3.medium"
cache_num_nodes = 1

eks_node_instance_types = ["t3.medium"]
eks_desired_size = 1
eks_min_size = 1
eks_max_size = 3

grafana_admin_password = "admin"

cors_allowed_origins = ["http://localhost:3000", "https://dev.hakawi.com"]

common_tags = {
  Project     = "hakawi"
  Environment = "dev"
  ManagedBy   = "terraform"
  Owner       = "platform-team"
  CostCenter  = "engineering"
}