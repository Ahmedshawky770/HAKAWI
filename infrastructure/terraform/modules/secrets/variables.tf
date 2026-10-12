# ============================================================================
# Application Secrets Module
#
# WHY this module exists: the release was blocked because NOTHING provisioned the AWS
# Secrets Manager secrets the Helm charts consume. The backend chart's ExternalSecret
# (infrastructure/helm/backend/templates/externalsecrets.yaml) syncs these paths into the
# Kubernetes secret `hakawi-backend-secrets`, which the Deployment mounts into the pods
# as DB_*/VALKEY_*/JWT_*/PAYMOB_*/SENTRY_DSN/S3_*/EMAIL_FROM. With no secrets in Secrets
# Manager, every ExternalSecret sync fails and every pod stays in
# CreateContainerConfigError. The infrastructure-owned secrets (db/*, valkey/*) are
# written by modules/rds and modules/elasticache next to the resources they belong to;
# this module owns the application credentials that belong to no data resource.
#
# THE EXACT CONTRACT (verified against the chart templates, not guessed):
#   SecretStore  : `aws-secrets-manager` (namespace `hakawi`, provider SecretsManager)
#   ExternalSecret `hakawi-backend-secrets`:
#     jwt.secret           <- <prefix>/jwt/secret           (whole value)
#     jwt.refresh-secret   <- <prefix>/jwt/refresh-secret   (whole value)
#     encryption.key       <- <prefix>/encryption/key       (whole value)
#     paymob.api-key       <- <prefix>/paymob/api-key       (whole value)
#     paymob.merchant-id   <- <prefix>/paymob/merchant-id   (whole value)
#     paymob.integration-id<- <prefix>/paymob/integration-id(whole value)
#     paymob.webhook-secret<- <prefix>/paymob/webhook-secret(whole value)
#     sentry.dsn           <- <prefix>/sentry/dsn           (whole value)
#     s3.access-key        <- <prefix>/s3/access-key        (whole value)
#     s3.secret-key        <- <prefix>/s3/secret-key        (whole value)
#     email.from           <- <prefix>/email/from           (whole value)
#   ExternalSecret `hakawi-frontend-secrets`:
#     api.url              <- <prefix>/frontend/api-url     (whole value)
#
# PRODUCTION VALUES MUST BE INJECTED OUT-OF-BAND (Principle #4): every credential is a
# variable with no default. dev puts obvious, dev-only placeholders in its tfvars;
# staging and production declare `""` and the real values are supplied at apply time
# (GitHub secret via TF_VAR_*). For the three cryptographic secrets an empty value makes
# this module generate a strong random one with `random_password` and store THAT in
# Secrets Manager — the same convention modules/rds uses for the master password — so a
# forgotten variable can never leave the app booting with a weak key. Values are never
# written in plaintext anywhere in this repository.
#
# THE PAYMOB CREDENTIALS ARE THE EXCEPTION, AND DELIBERATELY SO: the backend validates
# them at boot (`backend/src/config/paymob.config.ts`, zod min(1) plus a placeholder
# denylist), so an empty value is a CrashLoopBackOff, not a silent degradation. Writing it
# anyway is what produced that crash. `paymob_*` are therefore REFUSED at plan time for
# every environment except dev, by the preconditions on
# `aws_secretsmanager_secret.paymob_*` in main.tf. Preconditions rather than `variable`
# validation blocks because the condition reads `var.environment`, which Terraform
# < 1.9 rejects in a validation block (root `required_version = ">= 1.6.0"`).
#
# `secret_prefix` must be environment-scoped (`hakawi/<environment>`): it used to default
# to a bare `"hakawi"` shared by every environment, which put dev's JWT secret and
# production's in one namespace and scoped the backend IAM policy to both. Enforced by the
# preconditions in this module and in modules/iam / modules/rds / modules/elasticache.
# ============================================================================

variable "environment" {
  description = "Environment name"
  type        = string
}

variable "secret_prefix" {
  description = "AWS Secrets Manager path prefix (must match the Helm charts' externalSecrets.secretPrefix and be environment-scoped: hakawi/<environment>)"
  type        = string
}

# --- Backend cryptographic secrets -----------------------------------------
# The backend validates these at boot: JWT_SECRET / REFRESH_TOKEN_SECRET must be unique
# values of at least 32 characters and must not be publicly known placeholders in
# production (backend/src/config/jwt.config.ts + public-secret.ts); ENCRYPTION_KEY is
# required by encryption.config.ts and is NOT rotatable (changing it strands existing
# password-reset tokens), so a generated value is stored once and reused.

variable "jwt_secret" {
  description = "JWT signing secret (empty = generate a random 48-character secret). Production: inject out-of-band."
  type        = string
  default     = ""
  sensitive   = true
}

variable "jwt_refresh_secret" {
  description = "Refresh-token signing secret (empty = generate a random 48-character secret). Production: inject out-of-band."
  type        = string
  default     = ""
  sensitive   = true
}

variable "encryption_key" {
  description = "Encryption key for password-reset tokens (empty = generate a random 48-character secret). NOT rotatable once set."
  type        = string
  default     = ""
  sensitive   = true
}

# --- Paymob payment credentials ---------------------------------------------
# paymob.config.ts refuses to boot in production with the published sandbox placeholders
# and with an empty API key/merchant id/integration id (zod min(1)), so an empty value
# here fails closed at pod start — never a silent "payments broken" state. The webhook
# secret must be at least 32 characters or every webhook delivery is rejected.
#
# Because "fails closed at pod start" is a CrashLoopBackOff discovered AFTER the rollout,
# main.tf refuses an empty/short value at PLAN time for every environment except dev
# (preconditions on the four `aws_secretsmanager_secret.paymob_*` resources). The deploy
# workflows pass the real credentials as TF_VAR_paymob_* from GitHub secrets.

variable "paymob_api_key" {
  description = "Paymob API key. Production: inject out-of-band; the app refuses publicly known placeholders."
  type        = string
  default     = ""
  sensitive   = true
}

variable "paymob_merchant_id" {
  description = "Paymob merchant ID. Production: inject out-of-band."
  type        = string
  default     = ""
  sensitive   = true
}

variable "paymob_integration_id" {
  description = "Paymob integration ID. Production: inject out-of-band."
  type        = string
  default     = ""
  sensitive   = true
}

variable "paymob_webhook_secret" {
  description = "Paymob webhook secret (min 32 chars or every webhook is rejected as unsigned). Production: inject out-of-band."
  type        = string
  default     = ""
  sensitive   = true
}

# --- Observability -----------------------------------------------------------

variable "sentry_dsn" {
  description = "Sentry DSN (empty = the Sentry integration stays a no-op)"
  type        = string
  default     = ""
  sensitive   = true
}

# --- S3 static credentials ----------------------------------------------------
# WHY these exist at all when IRSA is the real credential path: the chart's
# ExternalSecret reads `<prefix>/s3/access-key` and `<prefix>/s3/secret-key` and mounts
# them as S3_ACCESS_KEY / S3_SECRET_KEY, and an ExternalSecret whose remote secret does
# not exist fails to sync. The backend's S3 client is injected and takes its credentials
# from the ambient AWS SDK chain — the instance role / IRSA — and reads NEITHER of these
# variables (backend/.env.example marks them "not read by any code"). They are
# placeholders that keep the chart contract intact; the real access path is the IRSA
# role's S3 policy (modules/iam, modules/eks).

variable "s3_access_key" {
  description = "Placeholder S3 access key synced for the chart contract. The app authenticates via IRSA and does not read this."
  type        = string
  default     = ""
  sensitive   = true
}

variable "s3_secret_key" {
  description = "Placeholder S3 secret key synced for the chart contract. The app authenticates via IRSA and does not read this."
  type        = string
  default     = ""
  sensitive   = true
}

# --- Non-credential values that still travel through Secrets Manager -----------

variable "email_from" {
  description = "From address for outbound mail (mounted as EMAIL_FROM)"
  type        = string
}

variable "frontend_api_url" {
  description = "Public API URL the frontend calls (mounted as NEXT_PUBLIC_API_URL)"
  type        = string
}

variable "tags" {
  description = "Tags for all resources"
  type        = map(string)
  default     = {}
}
