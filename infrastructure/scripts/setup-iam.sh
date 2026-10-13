#!/usr/bin/env bash
set -euo pipefail

# ============================================================================
# setup-iam.sh — GitHub Actions deploy bootstrap for Hakawi
# ============================================================================
#
# Usage:
#   ./setup-iam.sh [--help]
#
# Environment overrides:
#   AWS_REGION      AWS region for the state backend and IAM calls (default: us-east-1)
#   GITHUB_REPO     Owner/repo whose workflow tokens may assume the deploy role
#                   (default: Ahmedshawky770/HAKAWI)
#   ENVIRONMENTS    Environments whose per-env state bucket/lock table must exist
#                   (default: "dev staging production")
#
# Creates every IAM/backend resource the deploy workflows need, and NOTHING else:
#
#   1. The GitHub Actions OIDC identity provider
#        https://token.actions.githubusercontent.com  (aud/client-id: sts.amazonaws.com)
#   2. The `hakawi-github-deploy` role + `hakawi-github-deploy-policy` policy
#        (the role the .github/workflows/deploy-*.yml files assume)
#   3. The Terraform state backend the workflows init against — both naming
#        conventions the repository already references:
#          per-environment: hakawi-terraform-state-<env> / hakawi-terraform-lock-<env>
#          flat:            hakawi-terraform-state     / hakawi-terraform-locks
#
# The script is IDEMPOTENT: re-running it converges desired state and never
# fails on "already exists".
#
# ORDERING / BOOTSTRAP FREEDOM (why this used to deadlock):
#   The EKS clusters themselves are created BY the workflows that assume this
#   role. An earlier version of this script derived the OIDC issuer from an
#   EXISTING cluster (`aws eks describe-cluster`) and exited 1 when there was
#   none — so the role could never be created on a fresh account, and the
#   workflows (which need the role) could never create the cluster. Chicken and
#   egg. Nothing in this script requires any pre-existing cluster: GitHub's
#   OIDC issuer is a FIXED public URL, not a per-cluster ARN. (An EKS OIDC
#   issuer is for IRSA — in-cluster service accounts — not for workflow runners;
#   the cluster's own issuer is consumed by modules/eks + modules/iam when the
#   cluster is created.)
#
# Requires: aws CLI (with credentials that can create IAM policies/roles and the
# S3/DynamoDB backend) and jq. openssl is used when present to compute the
# provider thumbprint at runtime; otherwise a documented placeholder is used.

FALLBACK_THUMBPRINT="6938fd4e98bab03faadb97b34396831e3780aea1"

# ----------------------------------------------------------------------------
# Configuration (env-overridable)
# ----------------------------------------------------------------------------
AWS_REGION="${AWS_REGION:-us-east-1}"
GITHUB_REPO="${GITHUB_REPO:-Ahmedshawky770/HAKAWI}"
ENVIRONMENTS="${ENVIRONMENTS:-dev staging production}"

ROLE_NAME="hakawi-github-deploy"
POLICY_NAME="hakawi-github-deploy-policy"

# The GitHub Actions OIDC issuer is a fixed public endpoint — never derived from
# a cluster, never per-account.
ISSUER_URL="https://token.actions.githubusercontent.com"
ISSUER_HOST="token.actions.githubusercontent.com"
CLIENT_ID="sts.amazonaws.com"

ACCOUNT_ID=""
PROVIDER_ARN=""
POLICY_ARN=""
THUMBPRINT="$FALLBACK_THUMBPRINT"
TMP_DIR=""

usage() {
  # Same text as the header comment; kept in one place for --help.
  sed -n '2,/^FALLBACK_THUMBPRINT=/p' "$0" | sed '$d'
}

require_tools() {
  local missing=0 tool
  for tool in aws jq; do
    if ! command -v "$tool" >/dev/null 2>&1; then
      echo "ERROR: required tool '$tool' is not on PATH" >&2
      missing=1
    fi
  done
  if [ "$missing" -ne 0 ]; then
    echo "Install the missing tool(s) and re-run. No AWS resources were changed." >&2
    exit 1
  fi
}

# ============================================================================
# 1. GitHub Actions OIDC provider
# ============================================================================

# Compute the SHA-1 thumbprint of the GitHub token endpoint at runtime. The API
# requires SOME thumbprint; AWS verifies the server certificate against its own
# trusted-root bundle (so this value is not the security boundary — the URL and
# client-id are), but we prefer the live certificate and only fall back to the
# documented placeholder when openssl or the network is unavailable.
compute_thumbprint() {
  if ! command -v openssl >/dev/null 2>&1; then
    echo "WARNING: openssl not found; using placeholder thumbprint $FALLBACK_THUMBPRINT" >&2
    THUMBPRINT="$FALLBACK_THUMBPRINT"
    return 0
  fi

  local fp
  fp="$(echo | openssl s_client -connect ${ISSUER_HOST}:443 -servername ${ISSUER_HOST} 2>/dev/null \
    | openssl x509 -fingerprint -sha1 -noout 2>/dev/null | cut -d= -f2 | tr -d ':' | tr 'ABCDEF' 'abcdef')" || true

  if [ -n "$fp" ]; then
    THUMBPRINT="$fp"
    echo "Using runtime-computed thumbprint for ${ISSUER_HOST}: $THUMBPRINT"
  else
    THUMBPRINT="$FALLBACK_THUMBPRINT"
    echo "WARNING: could not compute the ${ISSUER_HOST} thumbprint at runtime;" >&2
    echo "         falling back to documented placeholder $THUMBPRINT" >&2
  fi
}

ensure_github_oidc_provider() {
  compute_thumbprint

  local existing
  existing="$(aws iam list-open-id-connect-providers \
    | jq -r --arg host "$ISSUER_HOST" \
        '.OpenIDConnectProviderList[] | select(.Arn | endswith("/" + $host)) | .Arn' \
    | head -n 1)"

  if [ -n "$existing" ]; then
    PROVIDER_ARN="$existing"
    echo "OIDC provider for ${ISSUER_HOST} already exists: $PROVIDER_ARN"
    echo "NOTE: thumbprints are validated against AWS's trust store, not against this list;"
    echo "      an existing provider is left untouched (idempotent no-op)."
    return 0
  fi

  echo "Creating GitHub Actions OIDC provider ${ISSUER_URL} ..."
  echo "  client-id-list: ${CLIENT_ID}"
  echo "  thumbprint:     ${THUMBPRINT}"
  PROVIDER_ARN="$(aws iam create-open-id-connect-provider \
    --url "$ISSUER_URL" \
    --client-id-list "$CLIENT_ID" \
    --thumbprint-list "$THUMBPRINT" \
    --region "$AWS_REGION" \
    --query 'OpenIDConnectProviderArn' --output text)"
  echo "Created OIDC provider: $PROVIDER_ARN"
}

# ============================================================================
# 2. Deploy role + policy
# ============================================================================

# AUD/SUB TRUST NOTE
# ==================
# Every unit of work in the deploy workflows exchanges a GitHub-minted OIDC
# token for AWS credentials (sts:AssumeRoleWithWebIdentity, via
# aws-actions/configure-aws-credentials). Those tokens carry two claims that
# matter here:
#
#   aud — the audience. GitHub sets it to sts.amazonaws.com for this token
#         request; the provider's --client-id-list enforces it, so a token
#         issued for any other audience is rejected by STS before this trust
#         policy is consulted.
#   sub — "repo:<owner>/<repo>:<ref|environment|context>". The trust policy
#         below conditions on it with StringLike so ANY subject from the real
#         repository is admitted: "repo:Ahmedshawky770/HAKAWI:*".
#
# Repository → workflow → environment mapping admitted by that condition:
#
#   repo:Ahmedshawky770/HAKAWI:refs/heads/develop
#       -> .github/workflows/deploy-dev.yml        -> environment: dev
#   repo:Ahmedshawky770/HAKAWI:refs/heads/main
#       -> .github/workflows/deploy-staging.yml    -> environment: staging
#       -> .github/workflows/deploy-production.yml -> environment: production
#       -> .github/workflows/backup.yml            -> environment: production
#
# (StringLike rather than String because GitHub appends the ref/environment/
# pull_request context after the repo prefix, and future refs must not require
# editing this policy. Narrowing to a single ref is a deliberate hardening
# choice: set GITHUB_REPO to an exact confessed value only if you also accept
# no workflow ever running from any other ref.)
write_trust_policy() {
  local file="$1"
  cat > "$file" <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::${ACCOUNT_ID}:oidc-provider/${ISSUER_HOST}"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringLike": {
          "${ISSUER_HOST}:sub": "repo:${GITHUB_REPO}:*"
        }
      }
    }
  ]
}
EOF
  jq empty "$file"
}

role_exists() {
  aws iam get-role --role-name "$1" >/dev/null 2>&1
}

ensure_deploy_role() {
  write_trust_policy "$TMP_DIR/trust-policy.json"

  if role_exists "$ROLE_NAME"; then
    echo "Role ${ROLE_NAME} already exists; refreshing its trust policy ..."
    aws iam update-assume-role-policy \
      --role-name "$ROLE_NAME" \
      --policy-document "file://$TMP_DIR/trust-policy.json"
    echo "Updated trust policy for ${ROLE_NAME}"
  else
    echo "Creating role ${ROLE_NAME} (trusted by ${ISSUER_HOST}) ..."
    aws iam create-role \
      --role-name "$ROLE_NAME" \
      --assume-role-policy "file://$TMP_DIR/trust-policy.json" \
      --description "Assumed by GitHub Actions OIDC from ${GITHUB_REPO} to deploy Hakawi" \
      --region "$AWS_REGION" >/dev/null
    echo "Created role ${ROLE_NAME}"
  fi
}

# The permission statements below are unchanged from the previous revision —
# they already cover both the flat bucket/table names declared in
# infrastructure/terraform/main.tf's backend block
# (hakawi-terraform-state / hakawi-terraform-locks, used by the deploy
# workflows' `terraform init -backend-config`) and the canonical
# per-environment names used by infrastructure/scripts/tf-init.sh
# (hakawi-terraform-state-<env> / hakawi-terraform-lock-<env>).
write_deploy_policy() {
  local file="$1"
  cat > "$file" <<POLICY_EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "eks:DescribeCluster",
        "eks:ListClusters",
        "eks:DescribeNodegroup",
        "eks:ListNodegroups",
        "eks:AccessKubernetesCluster",
        "eks:ListFargateProfiles",
        "eks:DescribeFargateProfile",
        "eks:CreateFargateProfile",
        "eks:DeleteFargateProfile",
        "eks:CreateNodegroup",
        "eks:DeleteNodegroup",
        "eks:UpdateNodegroupVersion",
        "eks:UpdateNodegroupConfig"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "eks:CreateAddon",
        "eks:DescribeAddon",
        "eks:DescribeAddonVersions",
        "eks:ListAddons",
        "eks:UpdateAddon",
        "eks:DeleteAddon"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "ec2:CreateSecurityGroup",
        "ec2:AuthorizeSecurityGroupIngress",
        "ec2:AuthorizeSecurityGroupEgress",
        "ec2:RevokeSecurityGroupIngress",
        "ec2:RevokeSecurityGroupEgress",
        "ec2:CreateTags",
        "ec2:DeleteTags",
        "ec2:ModifyTags"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "iam:PassRole",
        "iam:GetRole",
        "iam:CreateRole",
        "iam:DeleteRole",
        "iam:AttachRolePolicy",
        "iam:DetachRolePolicy",
        "iam:CreateRolePolicy",
        "iam:DeleteRolePolicy",
        "iam:ListAttachedRolePolicies",
        "iam:ListRolePolicies",
        "iam:GetRolePolicy"
      ],
      "Resource": "*",
      "Condition": {
        "StringLike": {
          "iam:PassedToService": "eks.amazonaws.com"
        }
      }
    },
    {
      "Effect": "Allow",
      "Action": [
        "sts:AssumeRole",
        "sts:DecodeAuthorizationMessage",
        "sts:GetCallerIdentity"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "terraform:*"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:PutObject",
        "s3:DeleteObject",
        "s3:ListBucket",
        "s3:GetBucketLocation"
      ],
      "Resource": [
        "arn:aws:s3:::hakawi-terraform-state",
        "arn:aws:s3:::hakawi-terraform-state/*",
        "arn:aws:s3:::hakawi-terraform-state-*",
        "arn:aws:s3:::hakawi-terraform-state-*/*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:GetItem",
        "dynamodb:PutItem",
        "dynamodb:DeleteItem",
        "dynamodb:UpdateItem",
        "dynamodb:DescribeTable"
      ],
      "Resource": [
        "arn:aws:dynamodb:$AWS_REGION:$ACCOUNT_ID:table/hakawi-terraform-locks",
        "arn:aws:dynamodb:$AWS_REGION:$ACCOUNT_ID:table/hakawi-terraform-lock-*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": [
        "kms:Decrypt",
        "kms:DescribeKey",
        "kms:Sign",
        "kms:Verify",
        "kms:GenerateDataKey"
      ],
      "Resource": "*"
    }
  ]
}
POLICY_EOF
  jq empty "$file"
}

ensure_deploy_policy() {
  write_deploy_policy "$TMP_DIR/deploy-policy.json"

  local existing_arn
  existing_arn="$(aws iam list-policies --scope Local \
    | jq -r --arg name "$POLICY_NAME" \
        '.Policies[] | select(.PolicyName == $name) | .Arn' \
    | head -n 1)"

  if [ -n "$existing_arn" ]; then
    POLICY_ARN="$existing_arn"
    echo "Policy ${POLICY_NAME} already exists (${POLICY_ARN}); rolling a new default version ..."
    roll_policy_version "$POLICY_ARN"
  else
    echo "Creating policy ${POLICY_NAME} ..."
    POLICY_ARN="$(aws iam create-policy \
      --policy-name "$POLICY_NAME" \
      --policy-document "file://$TMP_DIR/deploy-policy.json" \
      --description "Policy for GitHub Actions to deploy Hakawi infrastructure" \
      --region "$AWS_REGION" \
      --query 'Policy.Arn' --output text)"
    echo "Created policy: $POLICY_ARN"
  fi
}

# IAM allows at most five versions per managed policy, so the idempotent path
# is "new default version" (never create-policy, which fails with
# EntityAlreadyExists). Prune the oldest non-default version when full.
roll_policy_version() {
  local arn="$1"
  local count oldest
  count="$(aws iam list-policy-versions --policy-arn "$arn" | jq '[.Versions[]] | length')"
  if [ "$count" -ge 5 ]; then
    oldest="$(aws iam list-policy-versions --policy-arn "$arn" \
      | jq -r '[.Versions[] | select(.IsDefaultVersion == false)] | sort_by(.CreateDate) | .[0].VersionId // empty')"
    if [ -n "$oldest" ]; then
      echo "Policy is at the 5-version limit; deleting oldest non-default version $oldest ..."
      aws iam delete-policy-version --policy-arn "$arn" --version-id "$oldest"
    fi
  fi
  aws iam create-policy-version \
    --policy-arn "$arn" \
    --policy-document "file://$TMP_DIR/deploy-policy.json" \
    --set-as-default >/dev/null
  echo "Rolled new default version of ${arn}"
}

ensure_role_policy_attachment() {
  echo "Attaching policy ${POLICY_ARN} to role ${ROLE_NAME} ..."
  # attach-role-policy is idempotent: re-attaching a live ARN succeeds as a no-op.
  aws iam attach-role-policy \
    --role-name "$ROLE_NAME" \
    --policy-arn "$POLICY_ARN"
  echo "Attachment ensured"
}

# ============================================================================
# 3. Terraform state backend (S3 buckets + DynamoDB lock tables)
# ============================================================================

# Both naming conventions the repository already references must exist BEFORE
# any workflow runs `terraform init`:
#   * per-environment names — infrastructure/scripts/tf-init.sh
#       -backend-config="bucket=hakawi-terraform-state-<env>"
#       -backend-config="dynamodb_table=hakawi-terraform-lock-<env>"
#   * flat names — infrastructure/terraform/main.tf's backend block and the
#       deploy workflows (`terraform init -backend-config="key=..."`, with the
#       bucket/region/encrypt/dynamodb_table taken from that block)
ensure_state_bucket() {
  local bucket="$1"

  if aws s3api head-bucket --bucket "$bucket" 2>/dev/null; then
    echo "S3 state bucket already present: ${bucket}"
  else
    echo "Creating S3 state bucket ${bucket} (region ${AWS_REGION}) ..."
    if [ "$AWS_REGION" = "us-east-1" ]; then
      aws s3api create-bucket --bucket "$bucket" --region "$AWS_REGION" >/dev/null
    else
      aws s3api create-bucket --bucket "$bucket" --region "$AWS_REGION" \
        --create-bucket-configuration "LocationConstraint=${AWS_REGION}" >/dev/null
    fi
    echo "Created S3 state bucket: ${bucket}"
  fi

  # put-* calls are idempotent no-ops when the setting is already in place.
  echo "Ensuring versioning on ${bucket} ..."
  aws s3api put-bucket-versioning --bucket "$bucket" \
    --versioning-configuration Status=Enabled

  echo "Ensuring default encryption (AES256) on ${bucket} ..."
  aws s3api put-bucket-encryption --bucket "$bucket" \
    --server-side-encryption-configuration \
    '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}'

  echo "Ensuring public access block on ${bucket} ..."
  aws s3api put-public-access-block --bucket "$bucket" \
    --public-access-block-configuration \
    BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
}

ensure_lock_table() {
  local table="$1"

  if aws dynamodb describe-table --table-name "$table" >/dev/null 2>&1; then
    echo "DynamoDB lock table already present: ${table}"
    return 0
  fi

  echo "Creating DynamoDB lock table ${table} (PAY_PER_REQUEST) ..."
  aws dynamodb create-table \
    --table-name "$table" \
    --attribute-definitions AttributeName=LockID,AttributeType=S \
    --key-schema AttributeName=LockID,KeyType=HASH \
    --billing-mode PAY_PER_REQUEST \
    --region "$AWS_REGION" >/dev/null
  echo "Waiting for lock table ${table} to become ACTIVE ..."
  aws dynamodb wait table-exists --table-name "$table"
  echo "Lock table ACTIVE: ${table}"
}

ensure_backend() {
  local env
  # Per-environment convention (tf-init.sh)
  for env in $ENVIRONMENTS; do
    ensure_state_bucket "hakawi-terraform-state-${env}"
    ensure_lock_table  "hakawi-terraform-lock-${env}"
  done
  # Flat convention (main.tf backend block + deploy workflows)
  ensure_state_bucket "hakawi-terraform-state"
  ensure_lock_table  "hakawi-terraform-locks"
}

# ============================================================================
# Orchestration
# ============================================================================

main() {
  case "${1:-}" in
    "") ;;
    -h|--help) usage; exit 0 ;;
    *) echo "ERROR: unknown argument '$1'" >&2; usage >&2; exit 2 ;;
  esac

  require_tools

  TMP_DIR="$(mktemp -d)"
  trap 'rm -rf "$TMP_DIR"' EXIT

  ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"

  echo "=============================================================="
  echo "Hakawi GitHub Actions deploy bootstrap"
  echo "=============================================================="
  echo "Account ID:  $ACCOUNT_ID"
  echo "Region:      $AWS_REGION"
  echo "Repository:  $GITHUB_REPO  (trust condition: repo:${GITHUB_REPO}:*)"
  echo "OIDC issuer: $ISSUER_URL"
  echo ""

  echo "--------------------------------------------------------------"
  echo "1/3 GitHub Actions OIDC provider"
  echo "--------------------------------------------------------------"
  ensure_github_oidc_provider

  echo "--------------------------------------------------------------"
  echo "2/3 Deploy role and policy"
  echo "--------------------------------------------------------------"
  ensure_deploy_role
  ensure_deploy_policy
  ensure_role_policy_attachment

  echo "--------------------------------------------------------------"
  echo "3/3 Terraform state backend"
  echo "--------------------------------------------------------------"
  ensure_backend

  echo ""
  echo "IAM + backend setup complete (idempotent — safe to re-run)."
  echo ""
  echo "Provider ARN: $PROVIDER_ARN"
  echo "Role ARN:     arn:aws:iam::${ACCOUNT_ID}:role/${ROLE_NAME}"
  echo "Policy ARN:   $POLICY_ARN"
  echo "State:        s3://hakawi-terraform-state{,-<env>}"
  echo "              dynamodb hakawi-terraform-locks / hakawi-terraform-lock-<env>"
  echo "              (environments: $ENVIRONMENTS)"
  echo ""
  echo "The deploy workflows already assume this role:"
  echo "  role-to-assume: arn:aws:iam::\${AWS_ACCOUNT_ID}:role/${ROLE_NAME}"
}

main "$@"
