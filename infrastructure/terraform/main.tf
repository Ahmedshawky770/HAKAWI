terraform {
  required_version = ">= 1.6.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.23"
    }
    helm = {
      source  = "hashicorp/helm"
      version = "~> 2.10"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
    tls = {
      source  = "hashicorp/tls"
      version = "~> 4.0"
    }
  }

  backend "s3" {
    bucket         = "hakawi-terraform-state"
    key            = "infrastructure/terraform.tfstate"
    region         = "us-east-1"
    encrypt        = true
    dynamodb_table = "hakawi-terraform-locks"
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "hakawi"
      Environment = var.environment
      ManagedBy   = "terraform"
      Owner       = "platform-team"
    }
  }
}

provider "kubernetes" {
  host                   = module.eks.cluster_endpoint
  cluster_ca_certificate = base64decode(module.eks.cluster_certificate_authority_data)
  exec {
    api_version = "client.authentication.k8s.io/v1beta1"
    command     = "aws"
    args        = ["eks", "get-token", "--cluster-name", module.eks.cluster_name]
  }
}

provider "helm" {
  kubernetes {
    host                   = module.eks.cluster_endpoint
    cluster_ca_certificate = base64decode(module.eks.cluster_certificate_authority_data)
    exec {
      api_version = "client.authentication.k8s.io/v1beta1"
      command     = "aws"
      args        = ["eks", "get-token", "--cluster-name", module.eks.cluster_name]
    }
  }
}

module "vpc" {
  source = "./modules/vpc"

  environment     = var.environment
  vpc_cidr        = var.vpc_cidr
  private_subnets = var.private_subnets
  public_subnets  = var.public_subnets
  availability_zones = var.availability_zones

  tags = var.common_tags
}

module "iam" {
  source = "./modules/iam"

  environment = var.environment
  cluster_name = module.eks.cluster_name
  oidc_provider_arn = module.eks.oidc_provider_arn
  oidc_provider_url = module.eks.oidc_provider_url

  tags = var.common_tags
}

module "rds" {
  source = "./modules/rds"

  environment           = var.environment
  vpc_id                = module.vpc.vpc_id
  private_subnet_ids    = module.vpc.private_subnet_ids
  db_subnet_group_name  = "${var.environment}-hakawi-db-subnet-group"
  security_group_ids    = [module.vpc.database_security_group_id]

  engine_version        = "15.4"
  instance_class        = var.db_instance_class
  allocated_storage     = var.db_allocated_storage
  max_allocated_storage = var.db_max_allocated_storage
  multi_az              = var.db_multi_az
  backup_retention_period = var.db_backup_retention_period

  database_name         = "hakawi"
  master_username       = "postgres"
  master_password       = var.db_master_password

  replica_count         = var.db_replica_count
  replica_instance_class = var.db_replica_instance_class

  tags = var.common_tags
}

module "elasticache" {
  source = "./modules/elasticache"

  environment        = var.environment
  vpc_id             = module.vpc.vpc_id
  private_subnet_ids = module.vpc.private_subnet_ids
  security_group_ids = [module.vpc.cache_security_group_id]

  engine_version     = "8.0"
  node_type          = var.cache_node_type
  num_cache_nodes    = var.cache_num_nodes
  parameter_group_name = "default.valkey8"
  port               = 6379

  tags = var.common_tags
}

module "s3" {
  source = "./modules/s3"

  environment = var.environment

  bucket_name        = "${var.environment}-hakawi-media"
  versioning_enabled = true
  encryption_enabled = true
  public_access_block = true

  cors_rules = [{
    allowed_headers = ["*"]
    allowed_methods = ["GET", "PUT", "POST", "DELETE", "HEAD"]
    allowed_origins = var.cors_allowed_origins
    expose_headers  = ["ETag"]
    max_age_seconds = 3600
  }]

  lifecycle_rules = [{
    id      = "expire-incomplete-multipart-uploads"
    enabled = true
    abort_incomplete_multipart_upload_days = 7
  }]

  tags = var.common_tags
}

module "eks" {
  source = "./modules/eks"

  environment          = var.environment
  vpc_id               = module.vpc.vpc_id
  private_subnet_ids   = module.vpc.private_subnet_ids
  public_subnet_ids    = module.vpc.public_subnet_ids
  cluster_security_group_id = module.vpc.cluster_security_group_id

  cluster_version      = "1.28"
  cluster_endpoint_public_access  = true
  cluster_endpoint_private_access = true

  node_group_name          = "${var.environment}-hakawi-nodes"
  node_group_instance_types = var.eks_node_instance_types
  node_group_capacity_type = "ON_DEMAND"
  node_group_desired_size  = var.eks_desired_size
  node_group_min_size      = var.eks_min_size
  node_group_max_size      = var.eks_max_size

  tags = var.common_tags
}

module "monitoring" {
  source = "./modules/monitoring"

  environment    = var.environment
  vpc_id         = module.vpc.vpc_id
  private_subnet_ids = module.vpc.private_subnet_ids

  prometheus_retention_days = 30
  grafana_admin_password    = var.grafana_admin_password

  tags = var.common_tags
}