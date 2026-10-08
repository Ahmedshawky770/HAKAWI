output "vpc_id" {
  description = "VPC ID"
  value       = module.vpc.vpc_id
}

output "vpc_cidr" {
  description = "VPC CIDR block"
  value       = module.vpc.vpc_cidr
}

output "private_subnet_ids" {
  description = "Private subnet IDs"
  value       = module.vpc.private_subnet_ids
}

output "public_subnet_ids" {
  description = "Public subnet IDs"
  value       = module.vpc.public_subnet_ids
}

output "database_security_group_id" {
  description = "Database security group ID"
  value       = module.vpc.database_security_group_id
}

output "cache_security_group_id" {
  description = "Cache security group ID"
  value       = module.vpc.cache_security_group_id
}

output "cluster_security_group_id" {
  description = "EKS cluster security group ID"
  value       = module.vpc.cluster_security_group_id
}

output "rds_primary_endpoint" {
  description = "RDS primary endpoint"
  value       = module.rds.primary_endpoint
}

output "rds_primary_port" {
  description = "RDS primary port"
  value       = module.rds.primary_port
}

output "rds_replica_endpoints" {
  description = "RDS replica endpoints"
  value       = module.rds.replica_endpoints
}

output "rds_replica_ports" {
  description = "RDS replica ports"
  value       = module.rds.replica_ports
}

output "elasticache_primary_endpoint" {
  description = "ElastiCache primary endpoint"
  value       = module.elasticache.primary_endpoint
}

output "elasticache_replica_endpoints" {
  description = "ElastiCache replica endpoints"
  value       = module.elasticache.replica_endpoints
}

output "elasticache_port" {
  description = "ElastiCache port"
  value       = module.elasticache.port
}

output "s3_bucket_name" {
  description = "S3 bucket name"
  value       = module.s3.bucket_name
}

output "s3_bucket_arn" {
  description = "S3 bucket ARN"
  value       = module.s3.bucket_arn
}

output "eks_cluster_name" {
  description = "EKS cluster name"
  value       = module.eks.cluster_name
}

output "eks_cluster_endpoint" {
  description = "EKS cluster endpoint"
  value       = module.eks.cluster_endpoint
}

output "eks_cluster_arn" {
  description = "EKS cluster ARN"
  value       = module.eks.cluster_arn
}

output "eks_oidc_provider_arn" {
  description = "EKS OIDC provider ARN"
  value       = module.eks.oidc_provider_arn
}

output "eks_oidc_provider_url" {
  description = "EKS OIDC provider URL"
  value       = module.eks.oidc_provider_url
}

output "monitoring_prometheus_url" {
  description = "Prometheus URL"
  value       = module.monitoring.prometheus_url
}

output "monitoring_grafana_url" {
  description = "Grafana URL"
  value       = module.monitoring.grafana_url
}

output "monitoring_alertmanager_url" {
  description = "Alertmanager URL"
  value       = module.monitoring.alertmanager_url
}