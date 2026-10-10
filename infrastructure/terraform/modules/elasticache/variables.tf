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

variable "security_group_ids" {
  description = "Security group IDs"
  type        = list(string)
}

variable "engine_version" {
  description = "Valkey engine version"
  type        = string
  default     = "8.0"
}

variable "node_type" {
  description = "Cache node type"
  type        = string
}

variable "num_cache_nodes" {
  description = "Number of cache nodes (primary + replicas)"
  type        = number
  default     = 2
}

variable "parameter_group_name" {
  description = "Parameter group name"
  type        = string
  default     = "default.valkey8"
}

variable "port" {
  description = "Valkey port"
  type        = number
  default     = 6379
}

variable "tags" {
  description = "Tags for all resources"
  type        = map(string)
  default     = {}
}