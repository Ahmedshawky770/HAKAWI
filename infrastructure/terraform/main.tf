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

  # WHY `key` is deliberately absent from this block: a Terraform backend block cannot
  # interpolate variables, so the per-environment key cannot be written here — but this
  # block used to hardcode `key = "infrastructure/terraform.tfstate"`, which meant a bare
  # `terraform init` (no `-backend-config`) silently attached EVERY environment to the
  # SAME state file: the multi-environment state-collision footgun, where a `plan` in
  # production renders the dev state and vice versa.
  #
  # The key is supplied at init time by exactly one of the two documented init paths,
  # both of which already pass it:
  #   * infrastructure/scripts/tf-init.sh →
  #       -backend-config="bucket=hakawi-terraform-state-<env>"
  #       -backend-config="key=hakawi/<env>/terraform.tfstate"
  #       -backend-config="dynamodb_table=hakawi-terraform-lock-<env>"
  #   * .github/workflows/deploy-{dev,staging,production}.yml →
  #       -backend-config="key=hakawi/<env>/terraform.tfstate"
  #       (bucket/region/encrypt/dynamodb_table below are theirs)
  #
  # Everything the CLI does not pass is declared here. Omitting `key` from the block is
  # what makes the configuration coherent: the S3 backend treats it as required, so
  # `terraform init` without `-backend-config key=...` now FAILS FAST with
  # "key: required field is not set" instead of quietly sharing one state across
  # environments (Principle #15 — the mistake is caught at the boundary).
  #
  # OPERATOR NOTE: scripts/setup-iam.sh grants the deploy role
  # `arn:aws:s3:::hakawi-terraform-state-*` and
  # `arn:aws:dynamodb:<region>:<acct>:table/hakawi-terraform-lock-*`. The bucket and
  # table below (`hakawi-terraform-state`, `hakawi-terraform-locks`) do NOT match those
  # patterns, so a deploy that inits from this block under that role gets an AccessDenied
  # on state access. tf-init.sh sidesteps this by passing the per-environment bucket and
  # table (the documented local path), and CI uses `terraform init -backend=false`.
  # If the workflows must init straight from this block, add the bucket/table to their
  # `-backend-config` flags — the workflow files are outside this change's scope.
  backend "s3" {
    bucket         = "hakawi-terraform-state"
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

# ============================================================================
# Secrets Manager path prefix — ONE definition for every consumer.
#
# WHY it is derived and not defaulted flat: the prefix used to default to the bare
# `"hakawi"`, which every environment shared. IAM policies are scoped as
# `arn:aws:secretsmanager:<region>:<account>:secret:<prefix>/*` (modules/iam) and the node
# group policy used to sit on the same shape, so a dev apply could read
# `hakawi/production/jwt/secret` — production's signing key — and `hakawi/staging/db/password`.
# The shared prefix was the whole bug; deriving it from `var.environment` removes the
# sharing rather than hoping every tfvars remembers to override it. An explicit
# `secret_prefix` in a tfvars (or TF_VAR_secret_prefix) still wins, and every consuming
# module fails the plan if the value does not carry its own environment as a path segment.
#
# Consumers, all passed this exact value: modules/iam (the read policy), modules/secrets,
# modules/rds, modules/elasticache (the write paths) and the Helm charts'
# `externalSecrets.secretPrefix` (infrastructure/helm/backend/values*.yaml). The deploy
# workflows pass `terraform output -raw secret_prefix` back into the charts, so the chart
# and the state can never disagree about where this environment's secrets live.
# ============================================================================
locals {
  secret_prefix = var.secret_prefix != "" ? var.secret_prefix : "hakawi/${var.environment}"
}

module "vpc" {
  source = "./modules/vpc"

  environment     = var.environment
  vpc_cidr        = var.vpc_cidr
  private_subnets = var.private_subnets
  public_subnets  = var.public_subnets
  # Dedicated, disjoint tiers. The database subnets used to be sliced out of the private
  # /24s with cidrsubnet(), which produced overlapping CIDRs AWS rejects on apply; both
  # are explicit per-environment lists now (see environments/*/terraform.tfvars).
  database_subnets = var.database_subnets
  cache_subnets    = var.cache_subnets
  availability_zones = var.availability_zones

  # The module defaulted to us-east-1 for its endpoint service names; passing the actual
  # region keeps that honest when the environment runs somewhere else.
  aws_region = var.aws_region

  tags = var.common_tags
}

module "iam" {
  source = "./modules/iam"

  environment = var.environment
  cluster_name = module.eks.cluster_name
  oidc_provider_arn = module.eks.oidc_provider_arn
  oidc_provider_url = module.eks.oidc_provider_url
  # Scopes the backend role's Secrets Manager policy to the exact paths the charts read.
  # The secrets are written under the same prefix by modules/secrets, modules/rds and
  # modules/elasticache below, so policy and secrets cannot drift apart.
  # `local.secret_prefix` (not a flat `"hakawi"` default) is what keeps one environment
  # from being able to read another's secrets — see the locals block above.
  secret_prefix = local.secret_prefix

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

  # Empty (the default) means "no internal hosted zone here": the module creates zero
  # Route53 records instead of applying with an empty zone ID. Setting a real zone ID
  # in an environment's tfvars turns the replica CNAMEs on.
  route53_zone_id = var.route53_zone_id

  # Writes the <prefix>/db/* Secrets Manager paths the chart's ExternalSecret reads.
  secret_prefix = local.secret_prefix

  tags = var.common_tags
}

module "elasticache" {
  source = "./modules/elasticache"

  environment        = var.environment
  vpc_id             = module.vpc.vpc_id
  # Dedicated cache subnets (they used to run in the private subnets alongside the EKS
  # nodes; see modules/vpc).
  cache_subnet_ids   = module.vpc.cache_subnet_ids
  security_group_ids = [module.vpc.cache_security_group_id]

  engine_version     = "8.0"
  node_type          = var.cache_node_type
  num_cache_nodes    = var.cache_num_nodes
  parameter_group_name = "default.valkey8"
  port               = 6379

  # Empty (the default) generates a random 32-char token instead of applying with no
  # token while `auth_token_enabled = true`. Staging/production inject the real token
  # out-of-band (Principle #4).
  auth_token = var.valkey_auth_token

  # Writes the <prefix>/valkey/* Secrets Manager paths the chart's ExternalSecret reads.
  secret_prefix = local.secret_prefix

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
  # Was hardcoded to ["0.0.0.0/0"] inside the module. dev passes 0.0.0.0/0 (developer
  # machines + GitHub-hosted runners); staging and production pass [] so the public
  # endpoint answers nobody and cluster access comes from inside the VPC.
  cluster_endpoint_public_access_cidrs = var.eks_cluster_endpoint_public_access_cidrs

  node_group_name          = "${var.environment}-hakawi-nodes"
  node_group_instance_types = var.eks_node_instance_types
  node_group_capacity_type = "ON_DEMAND"
  node_group_desired_size  = var.eks_desired_size
  node_group_min_size      = var.eks_min_size
  node_group_max_size      = var.eks_max_size

  # WHY there is no `secret_prefix` argument here any more: modules/eks used to attach a
  # node-wide `arn:aws:secretsmanager:*:*:secret:<prefix>/*` statement to the node instance
  # role, so every pod on every node could read this environment's database password
  # regardless of its own IAM identity, in every region and account. Nothing in the repo
  # actually reads Secrets Manager from a node: the backend's ExternalSecrets authenticate
  # through the IRSA role in modules/iam (SecretStore `serviceAccountRef`), the pods get
  # their credentials from the ExternalSecret-synced Kubernetes secret, and the node role
  # only needs ECR / CNI / worker permissions. The statement and its input are gone.

  tags = var.common_tags
}

module "monitoring" {
  source = "./modules/monitoring"

  environment    = var.environment
  vpc_id         = module.vpc.vpc_id
  private_subnet_ids = module.vpc.private_subnet_ids

  # WHY this was missing: the module's prometheus.yaml.tpl reads `${cluster_name}` and
  # the variable has no default, so every apply failed with "Missing required argument:
  # cluster_name" before the Helm release was even attempted. The cluster the module
  # deploys into is, uncontroversially, this module's cluster.
  cluster_name = module.eks.cluster_name

  prometheus_retention_days = 30
  grafana_admin_password    = var.grafana_admin_password

  tags = var.common_tags
}

# Application secrets. WHY this wiring: these Secrets Manager paths are exactly what the
# Helm charts' ExternalSecret resources read (infrastructure/helm/backend/templates/
# externalsecrets.yaml + the frontend chart's frontend/api-url). Nothing provisioned
# them before, which is why the release was blocked — no secret, no ExternalSecret sync,
# no pods.
module "secrets" {
  source = "./modules/secrets"

  environment    = var.environment
  # Per-environment prefix matching the chart values: `hakawi/dev` (values.yaml),
  # `hakawi/staging` (values-staging.yaml), `hakawi/production`
  # (values-production.yaml). Derived from `var.environment` by default, so no environment
  # can end up on another environment's prefix.
  secret_prefix  = local.secret_prefix

  jwt_secret           = var.jwt_secret
  jwt_refresh_secret   = var.jwt_refresh_secret
  encryption_key       = var.encryption_key
  paymob_api_key       = var.paymob_api_key
  paymob_merchant_id   = var.paymob_merchant_id
  paymob_integration_id = var.paymob_integration_id
  paymob_webhook_secret = var.paymob_webhook_secret
  sentry_dsn           = var.sentry_dsn
  s3_access_key        = var.s3_access_key
  s3_secret_key        = var.s3_secret_key
  email_from           = var.email_from
  frontend_api_url     = var.frontend_api_url

  tags = var.common_tags
}