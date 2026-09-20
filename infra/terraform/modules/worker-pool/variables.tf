variable "region_name" {
  type        = string
  description = "The region identifier (e.g. eu-central-1)"
}

variable "redis_url" {
  type        = string
  description = "The Redis connection string to the Primary Control Plane"
}

variable "namespace" {
  type        = string
  description = "Kubernetes namespace"
  default     = "sibyl-worker-pool"
}
