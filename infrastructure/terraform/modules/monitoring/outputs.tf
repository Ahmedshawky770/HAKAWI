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