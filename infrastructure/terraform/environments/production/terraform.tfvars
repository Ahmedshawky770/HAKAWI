# Production Environment Configuration
environment = "production"

aws_region = "us-east-1"

vpc_cidr = "10.2.0.0/16"

availability_zones = ["us-east-1a", "us-east-1b", "us-east-1c"]

private_subnets = ["10.2.1.0/24", "10.2.2.0/24", "10.2.3.0/24"]

public_subnets = ["10.2.101.0/24", "10.2.102.0/24", "10.2.103.0/24"]

# Large instances for production
db_instance_class = "db.r6g.xlarge"
db_replica_instance_class = "db.r6g.xlarge"
db_allocated_storage = 500
db_max_allocated_storage = 2000
db_multi_az = true
db_backup_retention_period = 30
db_replica_count = 2
db_master_password = "" # Set via GitHub secret or AWS Secrets Manager

cache_node_type = "cache.r6g.xlarge"
cache_num_nodes = 3

eks_node_instance_types = ["m6i.2xlarge", "m6i.xlarge"]
eks_desired_size = 5
eks_min_size = 3
eks_max_size = 20

grafana_admin_password = "" # Set via GitHub secret

cors_allowed_origins = ["https://app.hakawi.com", "https://hakawi.com"]

common_tags = {
  Project     = "hakawi"
  Environment = "production"
  ManagedBy   = "terraform"
  Owner       = "platform-team"
  CostCenter  = "engineering"
  Backup      = "required"
  Compliance  = "SOC2"
}