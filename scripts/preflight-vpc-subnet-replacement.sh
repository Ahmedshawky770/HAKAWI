#!/usr/bin/env bash
# WHY THIS SCRIPT EXISTS.
#
# `cidr_block` is ForceNew on `aws_subnet`
# (infrastructure/terraform/modules/vpc/main.tf). The previous round replaced the database
# subnets' overlapping `/28` slices with dedicated `/24` tiers (AWS rejects the overlap), so
# an environment whose state still holds the OLD subnets does not merely drift —
# `terraform apply` plans a DESTROY of every database subnet, and the destroy FAILS while RDS
# still holds ENIs in them (`DependencyViolation: The subnet is in use`). A deploy that
# discovers this at "Deploy infrastructure" is red with no obvious cause, and the state is
# left holding a plan nobody ran.
#
# So the deploy workflows run the SAME plan here, first, and fail with the remediation
# instead of the AWS error. The check is `delete` in the planned action list of any
# `aws_subnet` — a create or an in-place update is fine, a replace (["delete","create"]) or a
# destroy is not.
#
# WHY A SCRIPT AND NOT THREE INLINE BLOCKS: one copy of the plan, the parse and the message
# keeps the three deploy workflows saying the same thing (Principle #9). It is shell because
# it is a thin wrapper around the terraform CLI; the logic it must not get wrong is the
# `jq` expression, which is why that is a single quoted expression below rather than an
# assembly of greps.
#
# USAGE
#   scripts/preflight-vpc-subnet-replacement.sh <environment> [terraform-root]
#
#   <environment>    dev | staging | production — selects the state key and the tfvars file.
#   [terraform-root] defaults to infrastructure/terraform relative to the repository root
#                    this script lives in, so it can be called from any cwd.
#
# EXIT CODES
#   0  no `aws_subnet` would be replaced or destroyed
#   1  a subnet replacement was planned (the deploy must stop), or the plan could not be
#      produced — both are reasons not to run the apply.
set -euo pipefail

ENVIRONMENT="${1:-}"
TERRAFORM_ROOT="${2:-}"

usage() {
  cat <<'USAGE'
Usage: scripts/preflight-vpc-subnet-replacement.sh <dev|staging|production> [terraform-root]

Plans the environment's Terraform root and fails (exit 1) when the plan would replace or
destroy any `aws_subnet` — the ForceNew `cidr_block` hazard recorded in
infrastructure/terraform/modules/vpc/main.tf, where RDS still holds ENIs in the subnets.
USAGE
}

if [ -z "$ENVIRONMENT" ]; then
  usage
  exit 1
fi

if [ ! -d "$TERRAFORM_ROOT" ]; then
  echo "::error::terraform root not found: $TERRAFORM_ROOT"
  exit 1
fi

VAR_FILE="environments/${ENVIRONMENT}/terraform.tfvars"
if [ ! -f "${TERRAFORM_ROOT}/${VAR_FILE}" ]; then
  # WHY the whitelist is spelled out: a typo in the environment would otherwise produce a
  # plan against the WRONG state key, and a plan against the wrong state is the failure this
  # whole script exists to prevent.
  echo "::error::no tfvars file for environment \"${ENVIRONMENT}\" at ${VAR_FILE}. Expected one of: dev, staging, production."
  exit 1
fi

if ! command -v terraform >/dev/null 2>&1; then
  echo "::error::the terraform CLI is not installed on this runner; the subnet-replacement preflight cannot run."
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "::error::jq is not installed on this runner; the subnet-replacement preflight cannot parse the plan."
  exit 1
fi

STATE_KEY="hakawi/${ENVIRONMENT}/terraform.tfstate"
# WHY `mktemp` without a template: `mktemp -t` is deprecated in GNU coreutils and absent on
# some images; a bare `mktemp` is the portable form and gives us TMPDIR-clean paths.
PLAN_FILE="$(mktemp)"
PLAN_JSON="${PLAN_FILE}.json"
cleanup() { rm -f "$PLAN_FILE" "$PLAN_JSON"; }
trap cleanup EXIT

cd "$TERRAFORM_ROOT"

# WHY init here: the plan needs the per-environment state to tell a replace from a create.
# A plan without the backend would render every subnet as "create" and pass vacuously — the
# exact false negative this check exists to prevent.
echo "Preflight: initialising terraform for ${ENVIRONMENT} (state key ${STATE_KEY})"
if ! terraform init -input=false -backend-config="key=${STATE_KEY}" >/dev/null; then
  {
    echo ""
    echo "::error::terraform init failed for ${ENVIRONMENT} (state key ${STATE_KEY}), so the"
    echo "subnet-replacement preflight cannot read the state it needs to tell a replace from a"
    echo "create — and the apply in this workflow would fail on the same backend. Two common"
    echo "causes, both of which belong to the state access rather than to this check:"
    echo "  * an S3/DynamoDB AccessDenied on the state bucket or lock table (see the OPERATOR"
    echo "    NOTE in infrastructure/terraform/main.tf: the deploy workflows pass only the"
    echo "    state key, so the bucket and lock table come from the backend block);"
    echo "  * a stale .terraform directory from a different environment (re-init, or run the"
    echo "    apply step's own init first)."
  } >&2
  exit 1
fi

echo "Preflight: planning ${ENVIRONMENT} to look for subnet replacements"
set +e
terraform plan \
  -input=false \
  -no-color \
  -detailed-exitcode \
  -var-file="$VAR_FILE" \
  -out="$PLAN_FILE"
PLAN_STATUS=$?
set -e

# 0 = no changes, 1 = error, 2 = changes present. Only 1 stops the deploy; a plan WITH
# changes is the normal case for a deploy.
if [ "$PLAN_STATUS" -eq 1 ]; then
  echo "::error::terraform plan failed for ${ENVIRONMENT}, so the subnet-replacement preflight cannot confirm the plan is safe. Fix the plan error above and re-run."
  exit 1
fi

if ! terraform show -json "$PLAN_FILE" >"$PLAN_JSON"; then
  echo "::error::could not read the plan file produced for ${ENVIRONMENT}."
  exit 1
fi

# Any `aws_subnet` whose planned actions include "delete": a destroy, or the delete half of a
# replace (["delete","create"]). Creates and in-place updates are absent from this filter.
destroyed_subnets_filter='[.resource_changes[]? | select(.type == "aws_subnet") | select((.change.actions // []) | index("delete")) | .address] | unique'

DESTROYED_SUBNETS="$(jq -r "$destroyed_subnets_filter | .[]" "$PLAN_JSON")"

if [ -n "$DESTROYED_SUBNETS" ]; then
  {
    echo ""
    echo "::error::terraform plan for ${ENVIRONMENT} would replace or destroy aws_subnet resources:"
    echo ""
    echo "$DESTROYED_SUBNETS" | sed 's/^/    /'
    echo ""
    echo "cidr_block is ForceNew on aws_subnet (infrastructure/terraform/modules/vpc/main.tf), and this"
    echo "environment's state still holds the OLD database/cache subnets that the dedicated /24 tiers"
    echo "replaced. Running the apply here destroys the subnets RDS still holds ENIs in, which fails with"
    echo "DependencyViolation and leaves the deploy red."
    echo ""
    echo "ONE-TIME, OUT-OF-BAND REMEDIATION (a deploy must not do this):"
    echo "  1. move the DB subnet group to the new tier — create/point the RDS subnet group at the new"
    echo "     database subnet IDs and confirm the instance reports them (aws rds modify-db-instance, or the"
    echo "     equivalent terraform state move/import for the new subnets). Never a live destroy of a subnet"
    echo "     that still holds an ENI."
    echo "  2. re-run this preflight; it should report no subnet replacements."
    echo "  3. then run the deploy (terraform apply) normally."
    echo ""
    echo "Do NOT \"fix\" this by reverting the CIDRs: AWS rejects the overlapping /28 slices the new"
    echo "dedicated tiers replaced."
  } >&2
  exit 1
fi

echo "::notice::Preflight passed: no aws_subnet would be replaced or destroyed in ${ENVIRONMENT}."
