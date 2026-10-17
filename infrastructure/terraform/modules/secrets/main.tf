# See variables.tf for the full WHY: this module exists because the release was blocked
# — no Terraform code provisioned the Secrets Manager paths the Helm charts' ExternalSecrets
# read. Every secret below matches a remoteRef key in
# infrastructure/helm/backend/templates/externalsecrets.yaml (and the frontend chart's
# `frontend/api-url`) exactly: same path, same shape (whole-value vs JSON property).
#
# Deletion policy: production keeps the 30-day recovery window; dev and staging use 0 so
# re-applying a renamed or re-created environment does not fight a soft-deleted secret
# from a previous run.

locals {
  # Empty credential -> generated random value, stored only in Secrets Manager.
  # Resolution mirrors modules/rds (`master_password != "" ? ... : random_password...`),
  # and the expression is used in exactly one place per secret so the value Terraform
  # writes is the same one the application will read.
  jwt_secret         = var.jwt_secret != "" ? var.jwt_secret : random_password.jwt_secret.result
  jwt_refresh_secret = var.jwt_refresh_secret != "" ? var.jwt_refresh_secret : random_password.jwt_refresh_secret.result
  encryption_key     = var.encryption_key != "" ? var.encryption_key : random_password.encryption_key.result

  # WHY dev is exempt: dev's tfvars carries obvious, dev-only placeholders so the chart's
  # ExternalSecrets have something to sync, and the backend rejects those placeholders at
  # boot in production (backend/src/config/public-secret.ts) — a dev-only value can never
  # reach a paying customer. staging and production have no such excuse: an empty Paymob
  # credential used to be written into Secrets Manager as an empty string, the pod then read
  # it, and the backend's zod schema refused to boot (CrashLoopBackOff) — after the rollout,
  # which is the expensive place to find out. Failing the APPLY is the same fail-closed
  # intent, one step earlier. Precondition and not `variable` validation because the
  # condition reads `var.environment`, which Terraform < 1.9 rejects (root
  # `required_version = ">= 1.6.0"`).
  paymob_credentials_required = var.environment != "dev"

  # WHY the prefix check lives here too: this module is what writes
  # `<prefix>/jwt/secret`, `<prefix>/paymob/api-key` and the rest, so a shared prefix
  # silently merges environments into one namespace. Every consuming module carries the
  # same guard; none of them trusts the caller (Principle #15).
  secret_prefix_scoped = length(regexall("/(${var.environment})(/|$)", var.secret_prefix)) > 0

  # All four SMTP credentials must be present in production, or verification and
  # password-reset mail never leaves the environment and the auth endpoints answer
  # truthfully that mail is not configured. dev and staging may leave them empty
  # (deliberate "no mail" default); production must not.
  email_credentials_complete = var.email_host != "" && var.email_port != "" && var.email_user != "" && var.email_password != ""
}

resource "random_password" "jwt_secret" {
  length  = 48
  special = false
}

resource "random_password" "jwt_refresh_secret" {
  length  = 48
  special = false
}

resource "random_password" "encryption_key" {
  length  = 48
  special = false
}

# --- JWT ---------------------------------------------------------------------

resource "aws_secretsmanager_secret" "jwt_secret" {
  name                    = "${var.secret_prefix}/jwt/secret"
  description             = "Hakawi ${var.environment} JWT signing secret (min 32 chars, not a published placeholder)"
  recovery_window_in_days = var.environment == "production" ? 30 : 0

  tags = merge(var.tags, {
    Name = "${var.secret_prefix}/jwt/secret"
  })

  lifecycle {
    precondition {
      condition     = local.secret_prefix_scoped
      error_message = "secret_prefix must be environment-scoped (\"hakawi/<environment>\"): the secrets are written as <secret_prefix>/jwt/secret and friends, and a shared or foreign prefix points this environment's credentials at another environment's paths. Got \"${var.secret_prefix}\" for environment \"${var.environment}\"."
    }
  }
}

resource "aws_secretsmanager_secret_version" "jwt_secret" {
  secret_id     = aws_secretsmanager_secret.jwt_secret.id
  secret_string = local.jwt_secret
}

resource "aws_secretsmanager_secret" "jwt_refresh_secret" {
  name                    = "${var.secret_prefix}/jwt/refresh-secret"
  description             = "Hakawi ${var.environment} refresh-token signing secret (min 32 chars, not a published placeholder)"
  recovery_window_in_days = var.environment == "production" ? 30 : 0

  tags = merge(var.tags, {
    Name = "${var.secret_prefix}/jwt/refresh-secret"
  })
}

resource "aws_secretsmanager_secret_version" "jwt_refresh_secret" {
  secret_id     = aws_secretsmanager_secret.jwt_refresh_secret.id
  secret_string = local.jwt_refresh_secret
}

# --- Encryption ----------------------------------------------------------------

resource "aws_secretsmanager_secret" "encryption_key" {
  name                    = "${var.secret_prefix}/encryption/key"
  description             = "Hakawi ${var.environment} encryption key (NOT rotatable once set)"
  recovery_window_in_days = var.environment == "production" ? 30 : 0

  tags = merge(var.tags, {
    Name = "${var.secret_prefix}/encryption/key"
  })
}

resource "aws_secretsmanager_secret_version" "encryption_key" {
  secret_id     = aws_secretsmanager_secret.encryption_key.id
  secret_string = local.encryption_key
}

# --- Paymob --------------------------------------------------------------------

resource "aws_secretsmanager_secret" "paymob_api_key" {
  name                    = "${var.secret_prefix}/paymob/api-key"
  description             = "Hakawi ${var.environment} Paymob API key (live values injected out-of-band in production)"
  recovery_window_in_days = var.environment == "production" ? 30 : 0

  tags = merge(var.tags, {
    Name = "${var.secret_prefix}/paymob/api-key"
  })

  # WHY FAIL THE APPLY: with no value this resource used to write an EMPTY STRING to
  # Secrets Manager. The ExternalSecret then synced that empty value, the pod booted with
  # PAYMOB_API_KEY="" and the backend's zod schema refused to start (CrashLoopBackOff) —
  # discovered after the rollout, in the most expensive place. `paymob.config.ts` validates
  # at boot for a reason; this precondition is the same intent at apply time, where it
  # costs a failed plan instead of a broken release. The deploy workflows supply the real
  # values as TF_VAR_paymob_* from GitHub secrets (`.github/workflows/deploy-*.yml`), and
  # the message says so, so the operator knows the fix rather than just the failure.
  lifecycle {
    precondition {
      condition     = !local.paymob_credentials_required || var.paymob_api_key != ""
      error_message = "paymob_api_key is empty for environment \"${var.environment}\". The backend refuses to boot with empty Paymob credentials (backend/src/config/paymob.config.ts), so an apply here would ship a CrashLoopBackOff release. Supply the real value at apply time — TF_VAR_paymob_api_key from the PAYMOB_API_KEY GitHub secret — or, for dev only, keep the dev placeholder."
    }
  }
}

resource "aws_secretsmanager_secret_version" "paymob_api_key" {
  secret_id     = aws_secretsmanager_secret.paymob_api_key.id
  secret_string = var.paymob_api_key
}

resource "aws_secretsmanager_secret" "paymob_merchant_id" {
  name                    = "${var.secret_prefix}/paymob/merchant-id"
  description             = "Hakawi ${var.environment} Paymob merchant ID"
  recovery_window_in_days = var.environment == "production" ? 30 : 0

  tags = merge(var.tags, {
    Name = "${var.secret_prefix}/paymob/merchant-id"
  })

  lifecycle {
    precondition {
      condition     = !local.paymob_credentials_required || var.paymob_merchant_id != ""
      error_message = "paymob_merchant_id is empty for environment \"${var.environment}\". The backend refuses to boot with empty Paymob credentials (backend/src/config/paymob.config.ts), so an apply here would ship a CrashLoopBackOff release. Supply the real value at apply time — TF_VAR_paymob_merchant_id from the PAYMOB_MERCHANT_ID GitHub secret — or, for dev only, keep the dev placeholder."
    }
  }
}

resource "aws_secretsmanager_secret_version" "paymob_merchant_id" {
  secret_id     = aws_secretsmanager_secret.paymob_merchant_id.id
  secret_string = var.paymob_merchant_id
}

resource "aws_secretsmanager_secret" "paymob_integration_id" {
  name                    = "${var.secret_prefix}/paymob/integration-id"
  description             = "Hakawi ${var.environment} Paymob integration ID"
  recovery_window_in_days = var.environment == "production" ? 30 : 0

  tags = merge(var.tags, {
    Name = "${var.secret_prefix}/paymob/integration-id"
  })

  lifecycle {
    precondition {
      condition     = !local.paymob_credentials_required || var.paymob_integration_id != ""
      error_message = "paymob_integration_id is empty for environment \"${var.environment}\". The backend refuses to boot with empty Paymob credentials (backend/src/config/paymob.config.ts), so an apply here would ship a CrashLoopBackOff release. Supply the real value at apply time — TF_VAR_paymob_integration_id from the PAYMOB_INTEGRATION_ID GitHub secret — or, for dev only, keep the dev placeholder."
    }
  }
}

resource "aws_secretsmanager_secret_version" "paymob_integration_id" {
  secret_id     = aws_secretsmanager_secret.paymob_integration_id.id
  secret_string = var.paymob_integration_id
}

resource "aws_secretsmanager_secret" "paymob_webhook_secret" {
  name                    = "${var.secret_prefix}/paymob/webhook-secret"
  description             = "Hakawi ${var.environment} Paymob webhook secret (min 32 chars or webhooks are rejected unsigned)"
  recovery_window_in_days = var.environment == "production" ? 30 : 0

  tags = merge(var.tags, {
    Name = "${var.secret_prefix}/paymob/webhook-secret"
  })

  lifecycle {
    precondition {
      condition     = !local.paymob_credentials_required || length(var.paymob_webhook_secret) >= 32
      error_message = "paymob_webhook_secret is empty or shorter than 32 characters for environment \"${var.environment}\". The backend rejects every webhook delivery signed with a short secret, so an apply here would ship a release that silently takes no payment callbacks. Supply the real value at apply time — TF_VAR_paymob_webhook_secret from the PAYMOB_HMAC_SECRET GitHub secret — or, for dev only, keep the dev placeholder."
    }
  }
}

resource "aws_secretsmanager_secret_version" "paymob_webhook_secret" {
  secret_id     = aws_secretsmanager_secret.paymob_webhook_secret.id
  secret_string = var.paymob_webhook_secret
}

# --- Sentry ---------------------------------------------------------------------

resource "aws_secretsmanager_secret" "sentry_dsn" {
  name                    = "${var.secret_prefix}/sentry/dsn"
  description             = "Hakawi ${var.environment} Sentry DSN (empty = integration stays a no-op)"
  recovery_window_in_days = var.environment == "production" ? 30 : 0

  tags = merge(var.tags, {
    Name = "${var.secret_prefix}/sentry/dsn"
  })
}

resource "aws_secretsmanager_secret_version" "sentry_dsn" {
  secret_id     = aws_secretsmanager_secret.sentry_dsn.id
  secret_string = var.sentry_dsn
}

# --- S3 (chart-contract placeholders; the app authenticates via IRSA) -------------

resource "aws_secretsmanager_secret" "s3_access_key" {
  name                    = "${var.secret_prefix}/s3/access-key"
  description             = "Hakawi ${var.environment} S3 access key placeholder (not read by the app; IRSA is the credential path)"
  recovery_window_in_days = var.environment == "production" ? 30 : 0

  tags = merge(var.tags, {
    Name = "${var.secret_prefix}/s3/access-key"
  })
}

resource "aws_secretsmanager_secret_version" "s3_access_key" {
  secret_id     = aws_secretsmanager_secret.s3_access_key.id
  secret_string = var.s3_access_key
}

resource "aws_secretsmanager_secret" "s3_secret_key" {
  name                    = "${var.secret_prefix}/s3/secret-key"
  description             = "Hakawi ${var.environment} S3 secret key placeholder (not read by the app; IRSA is the credential path)"
  recovery_window_in_days = var.environment == "production" ? 30 : 0

  tags = merge(var.tags, {
    Name = "${var.secret_prefix}/s3/secret-key"
  })
}

resource "aws_secretsmanager_secret_version" "s3_secret_key" {
  secret_id     = aws_secretsmanager_secret.s3_secret_key.id
  secret_string = var.s3_secret_key
}

# --- Email -----------------------------------------------------------------------

resource "aws_secretsmanager_secret" "email_from" {
  name                    = "${var.secret_prefix}/email/from"
  description             = "Hakawi ${var.environment} from address for outbound mail"
  recovery_window_in_days = var.environment == "production" ? 30 : 0

  tags = merge(var.tags, {
    Name = "${var.secret_prefix}/email/from"
  })
}

resource "aws_secretsmanager_secret_version" "email_from" {
  secret_id     = aws_secretsmanager_secret.email_from.id
  secret_string = var.email_from
}

# WHY THESE FOUR EXIST. The transactional mail transport in the backend
# (`common/email/smtp-email-transporter.ts`) stays null unless EMAIL_HOST, EMAIL_PORT,
# EMAIL_USER and EMAIL_PASSWORD are ALL present, and the auth flows it serves — email
# verification and password reset — are the ones that were answering "code sent" while
# sending nothing. The deployment must be able to configure them or every environment
# silently runs with mail disabled; `EMAIL_FROM` alone was never the contract.
#
# WHY THEY FAIL "OPEN" RATHER THAN CLOSED. Unlike the Paymob credentials above, a missing
# mail server does not stop the pod: the transport reports itself unconfigured, the send
# returns a rejection, and the endpoint answers truthfully that the mail could not be
# delivered. An empty value therefore means "this environment sends no mail", which is the
# safe default for dev and a deploy-blocking smell for production — which is why it is
# documented rather than defaulted to a placeholder relay no one owns.

resource "aws_secretsmanager_secret" "email_host" {
  name                    = "${var.secret_prefix}/email/host"
  description             = "Hakawi ${var.environment} SMTP host for outbound mail (mounted as EMAIL_HOST)"
  recovery_window_in_days = var.environment == "production" ? 30 : 0

  tags = merge(var.tags, {
    Name = "${var.secret_prefix}/email/host"
  })

  lifecycle {
    precondition {
      condition     = var.environment != "production" || local.email_credentials_complete
      error_message = "Production requires email_host to be set. Empty SMTP credentials mean verification and password-reset mail never leaves this environment."
    }
  }
}

resource "aws_secretsmanager_secret_version" "email_host" {
  secret_id     = aws_secretsmanager_secret.email_host.id
  secret_string = var.email_host
}

resource "aws_secretsmanager_secret" "email_port" {
  name                    = "${var.secret_prefix}/email/port"
  description             = "Hakawi ${var.environment} SMTP port for outbound mail (mounted as EMAIL_PORT)"
  recovery_window_in_days = var.environment == "production" ? 30 : 0

  tags = merge(var.tags, {
    Name = "${var.secret_prefix}/email/port"
  })

  lifecycle {
    precondition {
      condition     = var.environment != "production" || local.email_credentials_complete
      error_message = "Production requires email_port to be set. Empty SMTP credentials mean verification and password-reset mail never leaves this environment."
    }
  }
}

resource "aws_secretsmanager_secret_version" "email_port" {
  secret_id     = aws_secretsmanager_secret.email_port.id
  secret_string = var.email_port
}

resource "aws_secretsmanager_secret" "email_user" {
  name                    = "${var.secret_prefix}/email/user"
  description             = "Hakawi ${var.environment} SMTP user for outbound mail (mounted as EMAIL_USER)"
  recovery_window_in_days = var.environment == "production" ? 30 : 0

  tags = merge(var.tags, {
    Name = "${var.secret_prefix}/email/user"
  })

  lifecycle {
    precondition {
      condition     = var.environment != "production" || local.email_credentials_complete
      error_message = "Production requires email_user to be set. Empty SMTP credentials mean verification and password-reset mail never leaves this environment."
    }
  }
}

resource "aws_secretsmanager_secret_version" "email_user" {
  secret_id     = aws_secretsmanager_secret.email_user.id
  secret_string = var.email_user
}

resource "aws_secretsmanager_secret" "email_password" {
  name                    = "${var.secret_prefix}/email/password"
  description             = "Hakawi ${var.environment} SMTP password for outbound mail (mounted as EMAIL_PASSWORD)"
  recovery_window_in_days = var.environment == "production" ? 30 : 0

  tags = merge(var.tags, {
    Name = "${var.secret_prefix}/email/password"
  })

  lifecycle {
    precondition {
      condition     = var.environment != "production" || local.email_credentials_complete
      error_message = "Production requires email_password to be set. Empty SMTP credentials mean verification and password-reset mail never leaves this environment."
    }
  }
}

resource "aws_secretsmanager_secret_version" "email_password" {
  secret_id     = aws_secretsmanager_secret.email_password.id
  secret_string = var.email_password
}

# --- Frontend ----------------------------------------------------------------------
# The frontend chart's ExternalSecret (`hakawi-frontend-secrets`) reads only this one
# path and mounts it as NEXT_PUBLIC_API_URL.

resource "aws_secretsmanager_secret" "frontend_api_url" {
  name                    = "${var.secret_prefix}/frontend/api-url"
  description             = "Hakawi ${var.environment} public API URL for the frontend (NEXT_PUBLIC_API_URL)"
  recovery_window_in_days = var.environment == "production" ? 30 : 0

  tags = merge(var.tags, {
    Name = "${var.secret_prefix}/frontend/api-url"
  })
}

resource "aws_secretsmanager_secret_version" "frontend_api_url" {
  secret_id     = aws_secretsmanager_secret.frontend_api_url.id
  secret_string = var.frontend_api_url
}
