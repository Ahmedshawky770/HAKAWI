# EKS Module for Hakawi
# Creates EKS cluster with managed node groups, IRSA, and add-ons

resource "aws_eks_cluster" "main" {
  name     = "${var.environment}-hakawi"
  role_arn = aws_iam_role.cluster.arn
  version  = var.cluster_version

  vpc_config {
    subnet_ids              = concat(var.private_subnet_ids, var.public_subnet_ids)
    security_group_ids      = [var.cluster_security_group_id]
    endpoint_private_access = var.cluster_endpoint_private_access
    endpoint_public_access  = var.cluster_endpoint_public_access
    # Was hardcoded to ["0.0.0.0/0"], i.e. the Kubernetes API server open to the whole
    # internet. Now an input (cluster_endpoint_public_access_cidrs); an empty list is
    # private-only. dev passes 0.0.0.0/0 from its tfvars; staging/production pass [].
    public_access_cidrs = var.cluster_endpoint_public_access_cidrs
  }

  encryption_config {
    provider {
      key_arn = aws_kms_key.eks.arn
    }
    resources = ["secrets"]
  }

  enabled_cluster_log_types = ["api", "audit", "authenticator", "controllerManager", "scheduler"]

  tags = merge(var.tags, {
    Name = "${var.environment}-hakawi-eks"
  })
}

resource "aws_kms_key" "eks" {
  description             = "KMS key for EKS secrets encryption"
  deletion_window_in_days = 10
  enable_key_rotation     = true

  tags = merge(var.tags, {
    Name = "${var.environment}-hakawi-eks-kms"
  })
}

resource "aws_iam_role" "cluster" {
  name = "${var.environment}-hakawi-eks-cluster-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "eks.amazonaws.com"
      }
    }]
  })
}

resource "aws_iam_role_policy_attachment" "cluster" {
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKSClusterPolicy"
  role       = aws_iam_role.cluster.name
}

resource "aws_iam_role_policy_attachment" "cluster_service" {
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKSServicePolicy"
  role       = aws_iam_role.cluster.name
}

resource "aws_eks_addon" "vpc_cni" {
  cluster_name      = aws_eks_cluster.main.name
  addon_name        = "vpc-cni"
  addon_version     = "v1.14.0-eksbuild.1"
  resolve_conflicts = "OVERWRITE"
}

resource "aws_eks_addon" "coredns" {
  cluster_name      = aws_eks_cluster.main.name
  addon_name        = "coredns"
  addon_version     = "v1.11.1-eksbuild.6"
  resolve_conflicts = "OVERWRITE"
}

resource "aws_eks_addon" "kube_proxy" {
  cluster_name      = aws_eks_cluster.main.name
  addon_name        = "kube-proxy"
  addon_version     = "v1.28.2-eksbuild.2"
  resolve_conflicts = "OVERWRITE"
}

resource "aws_eks_addon" "ebs_csi" {
  cluster_name             = aws_eks_cluster.main.name
  addon_name               = "aws-ebs-csi-driver"
  addon_version            = "v1.28.0-eksbuild.1"
  resolve_conflicts        = "OVERWRITE"
  service_account_role_arn = aws_iam_role.ebs_csi.arn
}

# WHY metrics-server exists as an addon: the backend chart configures an HPA
# (values-*.yaml `autoscaling.enabled: true`), and an HPA cannot make a single scaling
# decision without the metrics.k8s.io API, which EKS does NOT deploy by default. Until
# now the HPA was configured with nothing behind it and reported `<unknown>` targets
# forever — a control plane that looks healthy and never acts. This addon is the missing
# dependency.
#
# Version `v0.7.2-eksbuild.1` is the AWS-published build compatible with this module's
# cluster version (1.28; the same build is published for 1.24–1.31). All addon versions
# in this module are pinned deliberately — EKS never moves an addon on its own, so an
# unpinned addon silently stays on whatever version the cluster was created with.
resource "aws_eks_addon" "metrics_server" {
  cluster_name      = aws_eks_cluster.main.name
  addon_name        = "metrics-server"
  addon_version     = "v0.7.2-eksbuild.1"
  resolve_conflicts = "OVERWRITE"
}

resource "aws_iam_role" "ebs_csi" {
  name = "${var.environment}-hakawi-ebs-csi-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Federated = aws_iam_openid_connect_provider.eks.arn
      }
      Condition = {
        StringEquals = {
          "${aws_iam_openid_connect_provider.eks.url}:sub" = "system:serviceaccount:kube-system:ebs-csi-controller-sa"
        }
      }
    }]
  })
}

resource "aws_iam_role_policy_attachment" "ebs_csi" {
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonEBSCSIDriverPolicy"
  role       = aws_iam_role.ebs_csi.name
}

resource "aws_iam_openid_connect_provider" "eks" {
  url             = aws_eks_cluster.main.identity[0].oidc[0].issuer
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = ["9e99a48a9960b14926bb7f3b02e22da2b0ab7280"]
}

resource "aws_eks_node_group" "main" {
  cluster_name    = aws_eks_cluster.main.name
  node_group_name = var.node_group_name
  node_role_arn   = aws_iam_role.node_group.arn
  subnet_ids      = var.private_subnet_ids

  scaling_config {
    desired_size = var.node_group_desired_size
    max_size     = var.node_group_max_size
    min_size     = var.node_group_min_size
  }

  instance_types = var.node_group_instance_types
  capacity_type  = var.node_group_capacity_type

  ami_type        = "AL2_x86_64"
  disk_size       = 50
  release_version = "1.28.20240601"

  labels = {
    Environment = var.environment
    Workload    = "general"
  }

  dynamic "taint" {
    for_each = var.node_group_taints
    content {
      key    = taint.value.key
      value  = taint.value.value
      effect = taint.value.effect
    }
  }

  tags = merge(var.tags, {
    Name = "${var.environment}-hakawi-node-group"
  })

  depends_on = [
    aws_eks_addon.vpc_cni,
    aws_eks_addon.coredns,
    aws_eks_addon.kube_proxy,
  ]
}

resource "aws_iam_role" "node_group" {
  name = "${var.environment}-hakawi-node-group-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "ec2.amazonaws.com"
      }
    }]
  })
}

resource "aws_iam_role_policy_attachment" "node_group_worker" {
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKSWorkerNodePolicy"
  role       = aws_iam_role.node_group.name
}

resource "aws_iam_role_policy_attachment" "node_group_cni" {
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKS_CNI_Policy"
  role       = aws_iam_role.node_group.name
}

resource "aws_iam_role_policy_attachment" "node_group_ecr" {
  policy_arn = "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly"
  role       = aws_iam_role.node_group.name
}

resource "aws_iam_role_policy" "node_group_s3" {
  name = "${var.environment}-hakawi-node-group-s3"
  role = aws_iam_role.node_group.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = [
        "s3:GetObject",
        "s3:PutObject",
        "s3:DeleteObject",
        "s3:ListBucket"
      ]
      Effect = "Allow"
      Resource = [
        "arn:aws:s3:::${var.environment}-hakawi-media",
        "arn:aws:s3:::${var.environment}-hakawi-media/*"
      ]
    }]
  })
}

# WHY THERE IS NO NODE-LEVEL SECRETS MANAGER POLICY ANY MORE. This module used to attach
# `arn:aws:secretsmanager:*:*:secret:<prefix>/*` (wildcard region AND account) to the node
# instance role as a "fallback". Two things are wrong with that, and neither is fixable by
# narrowing the ARN alone:
#
#   1. It is not needed. The application reads its secrets through ExternalSecrets, which
#      authenticate with the IRSA role in modules/iam (SecretStore `serviceAccountRef` on
#      the backend ServiceAccount) and materialise them as a Kubernetes secret. Nothing in
#      this repository — no chart, no values file, no workload, no doc — reads Secrets
#      Manager from a node. Verified by grepping the tree for the node role and its policy:
#      only this module referenced it.
#   2. A node-role grant is not a pod grant, it is a CLUSTER grant. Every pod on every node
#      inherits it: any compromised or simply curious workload could read the database
#      password with its ambient instance credentials, whatever its own IAM identity said.
#      The wildcard region/account widened that from "this environment" to "every
#      environment in every region and account the credentials reach".
#
# If a node-level tool ever genuinely needs a secret, it should get its own IRSA role with
# one path in its resource — not a statement attached to every node in the cluster.
