# Monitoring Module for Hakawi
# Deploys Prometheus, Grafana, Alertmanager via Helm charts

resource "helm_release" "prometheus" {
  name       = "prometheus"
  repository = "https://prometheus-community.github.io/helm-charts"
  chart      = "kube-prometheus-stack"
  version    = "55.5.0"
  namespace  = "monitoring"
  create_namespace = true

  values = [
    templatefile("${path.module}/values/prometheus.yaml.tpl", {
      environment = var.environment
      retention_days = var.prometheus_retention_days
      grafana_admin_password = var.grafana_admin_password
      cluster_name = var.cluster_name
    })
  ]
}

resource "aws_s3_bucket" "prometheus_backup" {
  bucket = "${var.environment}-hakawi-prometheus-backups"
  tags = var.tags
}

resource "aws_s3_bucket_versioning" "prometheus_backup" {
  bucket = aws_s3_bucket.prometheus_backup.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "prometheus_backup" {
  bucket = aws_s3_bucket.prometheus_backup.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "prometheus_backup" {
  bucket = aws_s3_bucket.prometheus_backup.id
  rule {
    id      = "expire-old-backups"
    enabled = true
    expiration {
      days = 90
    }
  }
}

output "prometheus_url" {
  description = "Prometheus URL"
  value       = "http://prometheus-operated.monitoring.svc.cluster.local:9090"
}

output "grafana_url" {
  description = "Grafana URL"
  value       = "http://prometheus-grafana.monitoring.svc.cluster.local:80"
}

output "alertmanager_url" {
  description = "Alertmanager URL"
  value       = "http://prometheus-alertmanager.monitoring.svc.cluster.local:9093"
}