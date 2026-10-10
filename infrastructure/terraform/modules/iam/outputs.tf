output "backend_role_arn" {
  description = "Backend IRSA role ARN"
  value       = aws_iam_role.backend.arn
}

output "external_dns_role_arn" {
  description = "External DNS role ARN"
  value       = aws_iam_role.external_dns.arn
}

output "cluster_autoscaler_role_arn" {
  description = "Cluster autoscaler role ARN"
  value       = aws_iam_role.cluster_autoscaler.arn
}

output "aws_load_balancer_controller_role_arn" {
  description = "AWS Load Balancer Controller role ARN"
  value       = aws_iam_role.aws_load_balancer_controller.arn
}