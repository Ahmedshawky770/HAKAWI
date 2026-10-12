variable "environment" {
  description = "Environment name"
  type        = string
}

variable "cluster_name" {
  description = "EKS cluster name"
  type        = string
}

variable "oidc_provider_arn" {
  description = "OIDC provider ARN"
  type        = string
}

variable "oidc_provider_url" {
  description = "OIDC provider URL"
  type        = string
}

variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "us-east-1"
}

# Namespace of the backend ServiceAccount as the Helm chart deploys it
# (infrastructure/helm/backend/values.yaml: `namespace: hakawi`).
variable "backend_sa_namespace" {
  description = "Kubernetes namespace of the backend ServiceAccount (must match the Helm chart)"
  type        = string
  default     = "hakawi"
}

# Name of the backend ServiceAccount as the Helm chart deploys it
# (infrastructure/helm/backend/values*.yaml: `serviceAccount.name: hakawi-backend`).
variable "backend_sa_name" {
  description = "Name of the backend ServiceAccount (must match the Helm chart)"
  type        = string
  default     = "hakawi-backend"
}

# AWS Secrets Manager path prefix the application's ExternalSecrets read from. The
# backend policy is scoped to this prefix, so it must match what the secrets modules
# write (and the chart's `externalSecrets.secretPrefix`).
#
# WHY it must carry its own environment as a path segment (`hakawi/<environment>`): the
# policy resource is `<prefix>/*`, so a shared prefix ("hakawi") or a foreign one
# ("hakawi/production" while applying dev) hands this environment the ability to read
# every other environment's secrets in the same account — production's JWT signing key
# included. The root module derives the scoped default; `aws_iam_role_policy.backend_secrets`
# refuses anything that does not match, so the mistake cannot be shipped by a caller.
variable "secret_prefix" {
  description = "AWS Secrets Manager path prefix the backend is allowed to read (must be environment-scoped: hakawi/<environment>)"
  type        = string
}

variable "tags" {
  description = "Tags for all resources"
  type        = map(string)
  default     = {}
}