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

variable "public_subnet_ids" {
  description = "Public subnet IDs"
  type        = list(string)
}

variable "cluster_security_group_id" {
  description = "Cluster security group ID"
  type        = string
}

variable "cluster_version" {
  description = "EKS cluster version"
  type        = string
  default     = "1.28"
}

variable "cluster_endpoint_public_access" {
  description = "Enable public endpoint access"
  type        = bool
  default     = true
}

variable "cluster_endpoint_private_access" {
  description = "Enable private endpoint access"
  type        = bool
  default     = true
}

variable "node_group_name" {
  description = "Node group name"
  type        = string
}

variable "node_group_instance_types" {
  description = "Node group instance types"
  type        = list(string)
}

variable "node_group_capacity_type" {
  description = "Node group capacity type"
  type        = string
  default     = "ON_DEMAND"
}

variable "node_group_desired_size" {
  description = "Desired node count"
  type        = number
}

variable "node_group_min_size" {
  description = "Minimum node count"
  type        = number
}

variable "node_group_max_size" {
  description = "Maximum node count"
  type        = number
}

variable "node_group_taints" {
  description = "Node group taints"
  type = list(object({
    key    = string
    value  = string
    effect = string
  }))
  default = []
}

variable "tags" {
  description = "Tags for all resources"
  type        = map(string)
  default     = {}
}