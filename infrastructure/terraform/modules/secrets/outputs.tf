# One output per secret ARN this module provisions. The root module re-exports them so
# the deploy side can reference the paths without guessing resource addresses.

output "jwt_secret_arn" {
  description = "ARN of the <prefix>/jwt/secret secret"
  value       = aws_secretsmanager_secret.jwt_secret.arn
}

output "jwt_refresh_secret_arn" {
  description = "ARN of the <prefix>/jwt/refresh-secret secret"
  value       = aws_secretsmanager_secret.jwt_refresh_secret.arn
}

output "encryption_key_secret_arn" {
  description = "ARN of the <prefix>/encryption/key secret"
  value       = aws_secretsmanager_secret.encryption_key.arn
}

output "paymob_api_key_secret_arn" {
  description = "ARN of the <prefix>/paymob/api-key secret"
  value       = aws_secretsmanager_secret.paymob_api_key.arn
}

output "paymob_merchant_id_secret_arn" {
  description = "ARN of the <prefix>/paymob/merchant-id secret"
  value       = aws_secretsmanager_secret.paymob_merchant_id.arn
}

output "paymob_integration_id_secret_arn" {
  description = "ARN of the <prefix>/paymob/integration-id secret"
  value       = aws_secretsmanager_secret.paymob_integration_id.arn
}

output "paymob_webhook_secret_arn" {
  description = "ARN of the <prefix>/paymob/webhook-secret secret"
  value       = aws_secretsmanager_secret.paymob_webhook_secret.arn
}

output "sentry_dsn_secret_arn" {
  description = "ARN of the <prefix>/sentry/dsn secret"
  value       = aws_secretsmanager_secret.sentry_dsn.arn
}

output "s3_access_key_secret_arn" {
  description = "ARN of the <prefix>/s3/access-key secret"
  value       = aws_secretsmanager_secret.s3_access_key.arn
}

output "s3_secret_key_arn" {
  description = "ARN of the <prefix>/s3/secret-key secret"
  value       = aws_secretsmanager_secret.s3_secret_key.arn
}

output "email_from_secret_arn" {
  description = "ARN of the <prefix>/email/from secret"
  value       = aws_secretsmanager_secret.email_from.arn
}

output "frontend_api_url_secret_arn" {
  description = "ARN of the <prefix>/frontend/api-url secret"
  value       = aws_secretsmanager_secret.frontend_api_url.arn
}
