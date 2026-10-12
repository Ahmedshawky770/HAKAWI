variable "environment" {
  description = "Environment name"
  type        = string
}

variable "vpc_cidr" {
  description = "VPC CIDR block"
  type        = string
}

variable "private_subnets" {
  description = "Private subnet CIDR blocks"
  type        = list(string)
}

variable "public_subnets" {
  description = "Public subnet CIDR blocks"
  type        = list(string)
}

# WHY database/cache subnets are explicit inputs instead of cidrsubnet() slices of the
# private ranges: the previous code carved them with
# `cidrsubnet(var.private_subnets[i], 4, i + 10)`, i.e. /28s INSIDE the private /24s.
# AWS rejects a VPC whose subnet CIDRs overlap, so `terraform apply` failed on every
# environment with a `InvalidParameterValue: ... has overlapping CIDR` error. Deriving
# subnets by arithmetic from another subnet can only ever overlap or collide; an explicit
# input makes the whole VPC CIDR plan readable in one place (the environment tfvars) and
# keeps each tier disjoint by construction (Principle #9 — one authoritative source for
# the address layout).
variable "database_subnets" {
  description = "Database subnet CIDR blocks (RDS) - must be disjoint from public, private and cache subnets"
  type        = list(string)
}

variable "cache_subnets" {
  description = "Cache subnet CIDR blocks (ElastiCache/Valkey) - must be disjoint from public, private and database subnets"
  type        = list(string)
}

variable "availability_zones" {
  description = "Availability zones"
  type        = list(string)
}

variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "us-east-1"
}

variable "tags" {
  description = "Tags for all resources"
  type        = map(string)
  default     = {}
}