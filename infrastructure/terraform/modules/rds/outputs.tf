output "primary_endpoint" {
  description = "Primary database endpoint"
  value       = aws_db_instance.primary.endpoint
}

output "primary_port" {
  description = "Primary database port"
  value       = aws_db_instance.primary.port
}

output "primary_arn" {
  description = "Primary database ARN"
  value       = aws_db_instance.primary.arn
}

output "replica_endpoints" {
  description = "Replica database endpoints"
  value       = aws_db_instance.replica[*].endpoint
}

output "replica_ports" {
  description = "Replica database ports"
  value       = aws_db_instance.replica[*].port
}

output "replica_arns" {
  description = "Replica database ARNs"
  value       = aws_db_instance.replica[*].arn
}

output "parameter_group_name" {
  description = "DB parameter group name"
  value       = aws_db_parameter_group.main.name
}

output "master_password" {
  description = "Master password (if generated)"
  value       = var.master_password != "" ? var.master_password : random_password.db_master.result
  sensitive   = true
}