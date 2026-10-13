# Staging Environment Configuration
environment = "staging"

aws_region = "us-east-1"

vpc_cidr = "10.1.0.0/16"

availability_zones = ["us-east-1a", "us-east-1b", "us-east-1c"]

private_subnets = ["10.1.1.0/24", "10.1.2.0/24", "10.1.3.0/24"]

public_subnets = ["10.1.101.0/24", "10.1.102.0/24", "10.1.103.0/24"]

# Database (RDS) and cache (Valkey) subnets — DEDICATED tiers, disjoint from the
# private/public subnets above. (The database tier used to be cidrsubnet() slices of the
# private /24s: overlapping CIDRs AWS rejects on apply.)
database_subnets = ["10.1.201.0/24", "10.1.202.0/24", "10.1.203.0/24"]
cache_subnets    = ["10.1.251.0/24", "10.1.252.0/24", "10.1.253.0/24"]

# Secrets Manager prefix — MUST match infrastructure/helm/backend/values-staging.yaml
# externalSecrets.secretPrefix ("hakawi/staging"). Environment-scoped by design: a shared
# prefix would put every environment's secrets in one namespace and scope the backend IAM
# policy to all of them.
secret_prefix = "hakawi/staging"

# No internal hosted zone in staging yet, so the module creates zero Route53 replica
# records. Set a real zone ID here to enable the replica CNAMEs. (An empty zone ID here
# used to make every apply fail with replica_count >= 1.)
route53_zone_id = ""

# Private-only Kubernetes API endpoint: the public endpoint answers nobody. Cluster
# access (deploys, kubectl) must come from inside the VPC/VPN — the deliberate
# consequence of replacing the previous ["0.0.0.0/0"].
#
# WHY THIS EMPTY LIST IS NOT THE WHOLE STORY (Principle #4): the deploy workflows run on
# `ubuntu-latest`, i.e. GitHub-hosted runners outside this VPC, so `aws eks
# update-kubeconfig` / `helm upgrade` / `kubectl` all hang until they time out. With `[]`
# that is the correct behaviour — it is the point of `[]` — but it must fail EARLY and
# LEGIBLY rather than after `terraform apply` has already closed the endpoint. Each deploy
# workflow therefore runs a "Preflight" step first (cluster reachability) that fails fast
# and names the two supported paths:
#   1. run the deploy from a self-hosted runner inside the VPC (or over the VPN), or
#   2. temporarily add the runner's egress CIDRs here and remove them after the deploy.
# Do not widen this to 0.0.0.0/0 or to GitHub's published ranges to make a pipeline green:
# that is a public control plane and a team decision, not a workaround.
eks_cluster_endpoint_public_access_cidrs = []

# Medium instances for staging
db_instance_class          = "db.r6g.large"
db_replica_instance_class  = "db.r6g.large"
db_allocated_storage       = 100
db_max_allocated_storage   = 500
db_multi_az                = true
db_backup_retention_period = 14
db_replica_count           = 2
db_master_password         = "" # Set via GitHub secret or SSM parameter

cache_node_type = "cache.r6g.large"
cache_num_nodes = 2

# Empty (the default) generates a random 32-character token stored in Secrets Manager;
# the real staging token is injected out-of-band (TF_VAR_valkey_auth_token).
valkey_auth_token = ""

eks_node_instance_types = ["m6i.xlarge"]
eks_desired_size        = 2
eks_min_size            = 2
eks_max_size            = 6

grafana_admin_password = "" # Set via GitHub secret

cors_allowed_origins = ["https://staging.hakawi.com", "https://app.staging.hakawi.com"]

# ---------------------------------------------------------------------------
# Application secrets — NO GOOD DEFAULTS EXIST (Principle #4). Empty values mean
# "inject out-of-band": supply the real values at apply time via TF_VAR_* / GitHub
# secrets. An empty jwt/encryption value makes Terraform generate a strong random secret
# and store it in Secrets Manager; an empty Paymob credential fails CLOSED at pod start
# (the backend's zod schema refuses missing/placeholder payment credentials) rather than
# silently taking no payments.
# ---------------------------------------------------------------------------
jwt_secret            = ""
jwt_refresh_secret    = ""
encryption_key        = ""
paymob_api_key        = ""
paymob_merchant_id    = ""
paymob_integration_id = ""
paymob_webhook_secret = ""
sentry_dsn            = ""
# Not read by the app (IRSA is the credential path); kept for the chart contract.
s3_access_key = ""
s3_secret_key = ""
email_from    = "noreply@staging.hakawi.io"
# Matches infrastructure/helm/backend/values-staging.yaml env.apiUrl.
frontend_api_url = "https://staging-api.hakawi.io/api/v1"

common_tags = {
  Project     = "hakawi"
  Environment = "staging"
  ManagedBy   = "terraform"
  Owner       = "platform-team"
  CostCenter  = "engineering"
}