output "bucket_name" {
  description = "S3 bucket name"
  value       = aws_s3_bucket.main.id
}

output "bucket_arn" {
  description = "S3 bucket ARN"
  value       = aws_s3_bucket.main.arn
}

output "bucket_domain_name" {
  description = "S3 bucket domain name"
  value       = aws_s3_bucket.main.bucket_domain_name
}

output "cloudfront_oai_id" {
  description = "CloudFront Origin Access Identity ID"
  value       = aws_cloudfront_origin_access_identity.main.id
}

output "cloudfront_oai_s3_canonical_user_id" {
  description = "CloudFront OAI S3 canonical user ID"
  value       = aws_cloudfront_origin_access_identity.main.s3_canonical_user_id
}