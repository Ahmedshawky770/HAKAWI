#!/usr/bin/env bash
set -euo pipefail

# Terraform initialization helper for Hakawi infrastructure
# Usage: ./scripts/tf-init.sh [environment]

ENVIRONMENT="${1:-dev}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TF_DIR="$SCRIPT_DIR/../terraform"
BUCKET_NAME="hakawi-terraform-state-${ENVIRONMENT}"
REGION="${AWS_REGION:-us-east-1}"

if [ "$ENVIRONMENT" != "dev" ] && [ "$ENVIRONMENT" != "staging" ] && [ "$ENVIRONMENT" != "production" ]; then
  echo "Error: Unknown environment '$ENVIRONMENT'. Use: dev, staging, or production"
  exit 1
fi

echo "Initializing Terraform for environment: $ENVIRONMENT"
echo "Region: $REGION"

cd "$TF_DIR"

# Check prerequisites
command -v terraform >/dev/null 2>&1 || { echo "Terraform is not installed"; exit 1; }

# Initialize backend
terraform init \
  -backend-config="bucket=$BUCKET_NAME" \
  -backend-config="key=hakawi/${ENVIRONMENT}/terraform.tfstate" \
  -backend-config="region=$REGION" \
  -backend-config="encrypt=true" \
  -backend-config="dynamodb_table=hakawi-terraform-lock-${ENVIRONMENT}"

# Validate
terraform validate

echo "Terraform initialized successfully for $ENVIRONMENT"
echo ""
echo "Next steps:"
echo "  terraform plan -var-file=environments/${ENVIRONMENT}/terraform.tfvars"
echo "  terraform apply -var-file=environments/${ENVIRONMENT}/terraform.tfvars"