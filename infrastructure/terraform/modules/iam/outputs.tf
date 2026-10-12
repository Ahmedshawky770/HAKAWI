# WHY outputs moved here from main.tf: the module declared these same outputs twice
# (once in main.tf, once here), which is a hard `terraform validate` failure
# ("Duplicate output definition"). This file is now the single source of truth.

# The backend IRSA role ARN the deploy side annotates the ServiceAccount with:
# `--set serviceAccount.annotations.eks\.amazonaws\.com/role-arn=<this value>`
output "backend_role_arn" {
  description = "Backend IRSA role ARN"
  value       = aws_iam_role.backend.arn
}

output "backend_role_name" {
  description = "Backend IRSA role name (convention: hakawi-<env>-hakawi-backend-irsa)"
  value       = aws_iam_role.backend.name
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
