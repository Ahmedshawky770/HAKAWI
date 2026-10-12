variable "environment" {
  description = "Environment name"
  type        = string
}

variable "vpc_id" {
  description = "VPC ID"
  type        = string
}

variable "private_subnet_ids" {
  description = "Private subnet IDs"
  type        = list(string)
}

variable "cluster_name" {
  description = "EKS cluster name"
  type        = string
}

variable "prometheus_retention_days" {
  description = "Prometheus retention days"
  type        = number
  default     = 30
}

variable "grafana_admin_password" {
  description = "Grafana admin password"
  type        = string
  sensitive   = true
}

variable "tags" {
  description = "Tags for all resources"
  type        = map(string)
  default     = {}
}

# The four SMTP variables exist because the production Alertmanager had email receivers with no
# smtp_* global: every alert rendered, matched a route and then failed to deliver, so the on-call
# rotation received nothing. Leaving the username and password empty is a supported state (the
# template omits the auth block instead of setting it to empty strings, which Alertmanager rejects).
variable "smtp_smarthost" {
  description = "SMTP host Alertmanager delivers alerts through. Empty disables delivery."
  type        = string
  default     = ""
}

variable "smtp_smarthost_port" {
  description = "SMTP port. 587 is submission with STARTTLS; the TLS requirement is unconditional."
  type        = number
  default     = 587
}

variable "smtp_from" {
  description = "Envelope-from address for alert mail."
  type        = string
  default     = "alertmanager@hakawi.com"
}

variable "smtp_username" {
  description = "SMTP username. Empty means unauthenticated submission (relay in-VPC)."
  type        = string
  default     = ""
  sensitive   = true
}

variable "smtp_password" {
  description = "SMTP password. Empty means unauthenticated submission."
  type        = string
  default     = ""
  sensitive   = true
}