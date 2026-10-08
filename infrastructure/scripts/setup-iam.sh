#!/usr/bin/env bash
set -euo pipefail

# Create IAM policy for GitHub Actions to deploy Hakawi infrastructure
# This script creates the OIDC provider and IAM roles needed for GitHub Actions

AWS_REGION="${AWS_REGION:-us-east-1}"
GITHUB_REPO="${GITHUB_REPO:-hakawi-io/hakawi}"
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

echo "Creating IAM resources for GitHub Actions..."
echo "Region: $AWS_REGION"
echo "Repository: $GITHUB_REPO"
echo "Account ID: $ACCOUNT_ID"

# Create OIDC provider
aws eks describe-cluster --name hakawi-dev-eks --query "cluster.identity.oidc.issuer" --output text 2>/dev/null || {
  echo "EKS cluster not found. Please run Terraform first."
  exit 1
}

ISSUER_URL=$(aws eks describe-cluster --name hakawi-dev-eks --query "cluster.identity.oidc.issuer" --output text)
ISSUER_HOST=$(echo "$ISSUER_URL" | sed 's|https://||')

# Create IAM OIDC provider if not exists
if ! aws iam list-open-id-connect-providers --query "OpenIDConnectProviderList[?contains(@.Arn, '$ISSUER_HOST')]" --output text | grep -q "arn"; then
  echo "Creating OIDC provider..."
  aws iam create-open-id-connect-provider \
    --url "$ISSUER_URL" \
    --client-id-list "sts.amazonaws.com" \
    --thumbprint-list "9e99a48a42e9b2da8b4e4b4b4b4b4b4b4b4b4b4b" \
    --region "$AWS_REGION"
fi

# Create deployment role
ROLE_NAME="hakawi-github-deploy"
POLICY_NAME="hakawi-github-deploy-policy"

cat > /tmp/hakawi-deploy-policy.json << POLICY_EOF
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
        "s3:ListBucket"
      ],
      "Resource": [
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
      "Resource": "arn:aws:dynamodb:$AWS_REGION:$ACCOUNT_ID:table/hakawi-terraform-lock-*"
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

aws iam create-policy \
  --policy-name "$POLICY_NAME" \
  --policy-document file:///tmp/hakawi-deploy-policy.json \
  --description "Policy for GitHub Actions to deploy Hakawi infrastructure"

aws iam create-role \
  --role-name "$ROLE_NAME" \
  --assume-role-policy "{
    \"Version\": \"2012-10-17\",
    \"Statement\": [
      {
        \"Effect\": \"Allow\",
        \"Principal\": {
          \"Federated\": \"arn:aws:iam::${ACCOUNT_ID}:oidc-provider/${ISSUER_HOST}\"
        },
        \"Action\": \"sts:AssumeRoleWithWebIdentity\",
        \"Condition\": {
          \"StringLike\": {
            \"${ISSUER_HOST}:sub\": \"system:serviceaccount:actions-runner:*\"
          }
        }
      }
    ]
  }"

aws iam attach-role-policy \
  --role-name "$ROLE_NAME" \
  --policy-arn "arn:aws:iam::${ACCOUNT_ID}:policy/${POLICY_NAME}"

echo "IAM setup complete!"
echo "Role ARN: arn:aws:iam::${ACCOUNT_ID}:role/${ROLE_NAME}"
echo ""
echo "Add this to your GitHub Actions workflow:"
echo "  role-to-assume: arn:aws:iam::${ACCOUNT_ID}:role/${ROLE_NAME}"