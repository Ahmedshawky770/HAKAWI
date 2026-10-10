# Staging Environment Configuration
environment = "staging"

aws_region = "us-east-1"

vpc_cidr = "10.1.0.0/16"

availability_zones = ["us-east-1a", "us-east-1b", "us-east-1c"]

private_subnets = ["10.1.1.0/24", "10.1.2.0/24", "10.1.3.0/24"]

public_subnets = ["10.1.101.0/24", "10.1.102.0/24", "10.1.103.0/24"]

# Medium instances for staging
db_instance_class = "db.r6g.large"
db_replica_instance_class = "db.r6g.large"
db_allocated_storage = 100
db_max_allocated_storage = 500
db_multi_az = true
db_backup_retention_period = 14
db_replica_count = 2
db_master_password = "" # Set via GitHub secret or SSM parameter

cache_node_type = "cache.r6g.large"
cache_num_nodes = 2

eks_node_instance_types = ["m6i.xlarge"]
eks_desired_size = 2
eks_min_size = 2
eks_max_size = 6

grafana_admin_password = "" # Set via GitHub secret

cors_allowed_origins = ["https://staging.hakawi.com", "https://app.staging.hakawi.com"]

common_tags = {
  Project     = "hakawi"
  Environment = "staging"
  ManagedBy   = "terraform"
  Owner       = "platform-team"
  CostCenter  = "engineering"
}