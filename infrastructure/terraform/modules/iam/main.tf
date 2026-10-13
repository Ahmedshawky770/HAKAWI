# IAM Module for Hakawi
# Creates IRSA roles for service accounts and other IAM resources

# WHY backend_sa_namespace / backend_sa_name are variables with these defaults: the
# trust policy used to hardcode `system:serviceaccount:hakawi:backend`, but the backend
# Helm chart (infrastructure/helm/backend) deploys its ServiceAccount as `hakawi-backend`
# in namespace `hakawi` (values.yaml: `namespace: hakawi`, `serviceAccount.name:
# hakawi-backend`, mirrored in values-staging.yaml / values-production.yaml). With the
# wrong subject in the condition, the OIDC web-identity assumption fails and every
# ExternalSecret sync and every S3 upload from the pod gets AccessDenied — the role
# exists, is annotated on the SA, and still cannot be used. The variables exist so the
# subject is configurable; the defaults ARE the chart's names, and changing one without
# the other re-breaks this.
data "aws_iam_policy_document" "backend_assume_role" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]
    effect  = "Allow"
    principals {
      type        = "Federated"
      identifiers = [var.oidc_provider_arn]
    }
    condition {
      test     = "StringEquals"
      variable = "${var.oidc_provider_url}:sub"
      values   = ["system:serviceaccount:${var.backend_sa_namespace}:${var.backend_sa_name}"]
    }
  }
}

# WHY the role name is `hakawi-<env>-...` and not `<env>-hakawi-...`: the deploy
# workflows annotate the ServiceAccount with
# `arn:aws:iam::<account>:role/hakawi-<env>-hakawi-backend-irsa`
# (.github/workflows/deploy-{dev,staging,production}.yml) and the chart's values files
# carry the same placeholder ARN. This convention is what the deploy side already
# references, so aligning to it needs zero downstream changes; the alternative (renaming
# the workflow references) would mean editing three workflow files that this change
# deliberately leaves untouched. The resulting ARN is
# `arn:aws:iam::<account>:role/hakawi-<env>-hakawi-backend-irsa`, surfaced as the
# `backend_role_arn` output.
resource "aws_iam_role" "backend" {
  name = "hakawi-${var.environment}-hakawi-backend-irsa"

  assume_role_policy = data.aws_iam_policy_document.backend_assume_role.json
}

resource "aws_iam_role_policy" "backend_secrets" {
  name = "hakawi-${var.environment}-hakawi-backend-secrets"
  role = aws_iam_role.backend.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = [
        "secretsmanager:GetSecretValue",
        "secretsmanager:DescribeSecret"
      ]
      Effect = "Allow"
      # WHY secret_prefix/* and not the old `hakawi/<env>/backend/*` +
      # `hakawi/<env>/shared/*`: those paths exist in no chart and no module — the
      # ExternalSecret resources read `hakawi/<env>/db/*`, `.../valkey/*`, `.../jwt/*`
      # and so on (modules/secrets, modules/rds, modules/elasticache write exactly the
      # chart's remoteRef keys). The policy is scoped to the actual prefix, passed from
      # the root module so it cannot drift from the secrets themselves (Principle #9).
      #
      # WHY THE REGION AND ACCOUNT ARE PINNED: the resource ARN used to be
      # `arn:aws:secretsmanager:*:*:secret:...` in the sibling node-role policy, and a
      # wildcard region/account turns "this environment's secrets" into "every secret
      # named hakawi/* in every region and every account this role can reach". The pod's
      # region and account are known here, so they are written down.
      Resource = [
        "arn:aws:secretsmanager:${var.aws_region}:${data.aws_caller_identity.current.account_id}:secret:${var.secret_prefix}/*"
      ]
    }]
  })

  # WHY THIS PRECONDITION IS A LIFECYCLE BLOCK AND NOT A `variable` VALIDATION: the check
  # has to read `var.environment`, and a validation block referring to another variable is
  # rejected by Terraform < 1.9, which this module must keep supporting
  # (root `required_version = ">= 1.6.0"`).
  #
  # WHY IT EXISTS AT ALL: the prefix used to default to the shared `"hakawi"`, so this
  # resource — whose blast radius is "every secret under <prefix>/*" — matched
  # `hakawi/production/jwt/secret` while applying dev. The root module now derives
  # `hakawi/<environment>` for itself, but this module is applied by whatever root calls
  # it, so the guard lives with the grant instead of trusting the caller. A prefix without
  # its own environment as a path segment (the bare `hakawi`, or another environment's
  # `hakawi/production`) fails the plan here rather than silently over-granting.
  lifecycle {
    precondition {
      condition     = length(regexall("/(${var.environment})(/|$)", var.secret_prefix)) > 0
      error_message = "secret_prefix must be environment-scoped (\"hakawi/<environment>\"): the backend policy grants secretsmanager:GetSecretValue on <secret_prefix>/*, and a shared or foreign prefix would let this environment read another environment's secrets. Got \"${var.secret_prefix}\" for environment \"${var.environment}\"."
    }
  }
}

resource "aws_iam_role_policy" "backend_s3" {
  name = "${var.environment}-hakawi-backend-s3"
  role = aws_iam_role.backend.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = [
        "s3:GetObject",
        "s3:PutObject",
        "s3:DeleteObject",
        "s3:ListBucket",
        "s3:GetObjectVersion"
      ]
      Effect = "Allow"
      Resource = [
        "arn:aws:s3:::${var.environment}-hakawi-media",
        "arn:aws:s3:::${var.environment}-hakawi-media/*"
      ]
    }]
  })
}

resource "aws_iam_role_policy" "backend_rds" {
  name = "${var.environment}-hakawi-backend-rds"
  role = aws_iam_role.backend.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = [
        "rds-db:connect"
      ]
      Effect = "Allow"
      Resource = [
        "arn:aws:rds-db:${var.aws_region}:${data.aws_caller_identity.current.account_id}:dbuser:*/*"
      ]
    }]
  })
}

data "aws_caller_identity" "current" {}

# IAM role for AWS Load Balancer Controller
data "aws_iam_policy_document" "external_dns_assume_role" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]
    effect  = "Allow"
    principals {
      type        = "Federated"
      identifiers = [var.oidc_provider_arn]
    }
    condition {
      test     = "StringEquals"
      variable = "${var.oidc_provider_url}:sub"
      values   = ["system:serviceaccount:kube-system:external-dns"]
    }
  }
}

resource "aws_iam_role" "external_dns" {
  name = "${var.environment}-hakawi-external-dns"

  assume_role_policy = data.aws_iam_policy_document.external_dns_assume_role.json
}

resource "aws_iam_role_policy" "external_dns_route53" {
  name = "${var.environment}-hakawi-external-dns-route53"
  role = aws_iam_role.external_dns.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = [
        "route53:ChangeResourceRecordSets",
        "route53:ListHostedZones",
        "route53:ListResourceRecordSets"
      ]
      Effect   = "Allow"
      Resource = "*"
    }]
  })
}

# IAM role for cluster-autoscaler
data "aws_iam_policy_document" "cluster_autoscaler_assume_role" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]
    effect  = "Allow"
    principals {
      type        = "Federated"
      identifiers = [var.oidc_provider_arn]
    }
    condition {
      test     = "StringEquals"
      variable = "${var.oidc_provider_url}:sub"
      values   = ["system:serviceaccount:kube-system:cluster-autoscaler"]
    }
  }
}

resource "aws_iam_role" "cluster_autoscaler" {
  name = "${var.environment}-hakawi-cluster-autoscaler"

  assume_role_policy = data.aws_iam_policy_document.cluster_autoscaler_assume_role.json
}

resource "aws_iam_role_policy" "cluster_autoscaler" {
  name = "${var.environment}-hakawi-cluster-autoscaler-policy"
  role = aws_iam_role.cluster_autoscaler.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = [
        "autoscaling:DescribeAutoScalingGroups",
        "autoscaling:DescribeAutoScalingInstances",
        "autoscaling:DescribeLaunchConfigurations",
        "autoscaling:DescribeTags",
        "autoscaling:SetDesiredCapacity",
        "autoscaling:TerminateInstanceInAutoScalingGroup",
        "ec2:DescribeLaunchTemplateVersions"
      ]
      Effect   = "Allow"
      Resource = "*"
    }]
  })
}

# IAM role for AWS Load Balancer Controller
data "aws_iam_policy_document" "aws_load_balancer_controller_assume_role" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]
    effect  = "Allow"
    principals {
      type        = "Federated"
      identifiers = [var.oidc_provider_arn]
    }
    condition {
      test     = "StringEquals"
      variable = "${var.oidc_provider_url}:sub"
      values   = ["system:serviceaccount:kube-system:aws-load-balancer-controller"]
    }
  }
}

resource "aws_iam_role" "aws_load_balancer_controller" {
  name = "${var.environment}-hakawi-aws-load-balancer-controller"

  assume_role_policy = data.aws_iam_policy_document.aws_load_balancer_controller_assume_role.json
}

resource "aws_iam_role_policy" "aws_load_balancer_controller" {
  name = "${var.environment}-hakawi-aws-load-balancer-controller-policy"
  role = aws_iam_role.aws_load_balancer_controller.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = [
          "iam:CreateServiceLinkedRole",
          "ec2:DescribeAccountAttributes",
          "ec2:DescribeAddresses",
          "ec2:DescribeAvailabilityZones",
          "ec2:DescribeInternetGateways",
          "ec2:DescribeVpcs",
          "ec2:DescribeSubnets",
          "ec2:DescribeSecurityGroups",
          "ec2:DescribeInstances",
          "ec2:DescribeNetworkInterfaces",
          "ec2:DescribeTags",
          "ec2:GetCoipPoolUsage",
          "ec2:DescribeCoipPools",
          "elasticloadbalancing:DescribeLoadBalancers",
          "elasticloadbalancing:DescribeLoadBalancerAttributes",
          "elasticloadbalancing:DescribeListeners",
          "elasticloadbalancing:DescribeListenerCertificates",
          "elasticloadbalancing:DescribeSSLPolicies",
          "elasticloadbalancing:DescribeRules",
          "elasticloadbalancing:DescribeTargetGroups",
          "elasticloadbalancing:DescribeTargetGroupAttributes",
          "elasticloadbalancing:DescribeTargetHealth",
          "elasticloadbalancing:DescribeTags"
        ]
        Effect   = "Allow"
        Resource = "*"
      },
      {
        Action = [
          "cognito-idp:DescribeUserPoolClient",
          "acm:ListCertificates",
          "acm:DescribeCertificate",
          "iam:ListServerCertificates",
          "iam:GetServerCertificate",
          "waf-regional:GetWebACL",
          "waf-regional:GetWebACLForResource",
          "waf-regional:AssociateWebACL",
          "waf-regional:DisassociateWebACL",
          "wafv2:GetWebACL",
          "wafv2:GetWebACLForResource",
          "wafv2:AssociateWebACL",
          "wafv2:DisassociateWebACL",
          "shield:GetSubscriptionState",
          "shield:DescribeProtection",
          "shield:CreateProtection",
          "shield:DeleteProtection"
        ]
        Effect   = "Allow"
        Resource = "*"
      },
      {
        Action = [
          "ec2:AuthorizeSecurityGroupIngress",
          "ec2:RevokeSecurityGroupIngress",
          "ec2:CreateSecurityGroup",
          "ec2:CreateTags",
          "ec2:DeleteTags",
          "ec2:DeleteSecurityGroup",
          "elasticloadbalancing:CreateLoadBalancer",
          "elasticloadbalancing:CreateTargetGroup",
          "elasticloadbalancing:CreateListener",
          "elasticloadbalancing:DeleteLoadBalancer",
          "elasticloadbalancing:DeleteTargetGroup",
          "elasticloadbalancing:DeleteListener",
          "elasticloadbalancing:ModifyLoadBalancerAttributes",
          "elasticloadbalancing:ModifyTargetGroup",
          "elasticloadbalancing:ModifyTargetGroupAttributes",
          "elasticloadbalancing:ModifyListener",
          "elasticloadbalancing:AddTags",
          "elasticloadbalancing:RemoveTags",
          "elasticloadbalancing:SetIpAddressType",
          "elasticloadbalancing:SetSecurityGroups",
          "elasticloadbalancing:SetSubnets",
          "elasticloadbalancing:RegisterTargets",
          "elasticloadbalancing:DeregisterTargets"
        ]
        Effect   = "Allow"
        Resource = "*"
        Condition = {
          StringEquals = {
            "aws:RequestTag/elbv2.k8s.aws/cluster" = var.cluster_name
          }
        }
      },
      {
        Action = [
          "ec2:CreateSecurityGroup",
          "ec2:CreateTags",
          "ec2:DeleteTags"
        ]
        Effect   = "Allow"
        Resource = "*"
        Condition = {
          StringEquals = {
            "aws:RequestTag/kubernetes.io/cluster/${var.cluster_name}" = "owned"
          }
        }
      },
      {
        Action = [
          "ec2:AuthorizeSecurityGroupIngress",
          "ec2:RevokeSecurityGroupIngress",
          "ec2:DeleteSecurityGroup"
        ]
        Effect   = "Allow"
        Resource = "*"
        Condition = {
          StringEquals = {
            "aws:ResourceTag/kubernetes.io/cluster/${var.cluster_name}" = "owned"
          }
        }
      }
    ]
  })
}