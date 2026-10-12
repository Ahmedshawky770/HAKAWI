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

# WHY this variable: the cluster used to hardcode `public_access_cidrs = ["0.0.0.0/0"]`,
# which exposes the Kubernetes API server to the entire internet. The list is now an
# input. An empty list means "no public access at all" (the public endpoint exists but
# answers nobody), which is the recommended posture — Principle #15 treats an open API
# endpoint as a missing first line of defense. dev keeps 0.0.0.0/0 in its tfvars so
# developer machines and GitHub-hosted runners can still reach the throwaway cluster;
# staging/production default to the empty list, and their tfvars comment records the
# operational consequence: cluster access must come from inside the VPC.
#
# WHY THE CONSEQUENCE IS SPELLED OUT IN A COMMENT AND IN A PIPELINE STEP, NOT JUST HERE:
# with `[]` the Kubernetes API server answers nobody outside the VPC, so `aws eks
# update-kubeconfig`, `helm upgrade` and `kubectl` all time out. The deploy workflows run
# on GitHub-hosted runners (`ubuntu-latest`) which are OUTSIDE the VPC, so the FIRST deploy
# into such an environment used to apply the infrastructure, close the endpoint, and only
# then fail at "Update kubeconfig" — mid-rollout, with the new cluster already live. The
# two supported paths are unchanged and are enforced by the "Preflight" step at the start of
# each deploy workflow, before any apply: deploy from a self-hosted runner inside the VPC
# (or over the VPN), or temporarily add the runner egress CIDRs and remove them afterwards.
# Do NOT "fix" a timeout by widening this to 0.0.0.0/0 or to GitHub's published ranges:
# that turns the hardened control plane into a public one, and it is a team decision, not a
# pipeline workaround.
variable "cluster_endpoint_public_access_cidrs" {
  description = "CIDR blocks allowed to reach the public API endpoint (empty = private-only; deploys from GitHub-hosted runners then require a self-hosted in-VPC runner)"
  type        = list(string)
  default     = []
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