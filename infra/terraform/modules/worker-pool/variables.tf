variable "region_name" {
  type        = string
  description = "The region identifier (e.g. eu-central-1); added as a label"
}

variable "redis_url" {
  type        = string
  description = "Redis connection URL (redis://[user:password@]host:port[/db] or rediss://...) of the control plane's BullMQ Redis"

  validation {
    condition     = can(regex("^rediss?://[^/?#]+", var.redis_url))
    error_message = "redis_url must look like redis://host:port or rediss://user:password@host:port/0."
  }
}

variable "namespace" {
  type        = string
  description = "Kubernetes namespace for the worker pool"
  default     = "sibyl-worker-pool"
}

variable "create_namespace" {
  type        = bool
  description = "Create the namespace. Set to false if it already exists"
  default     = true
}

variable "image" {
  type        = string
  description = "Worker container image (build with: docker build -f docker/Dockerfile --target worker .)"
  default     = "sibyl/worker:latest"
}

variable "worker_concurrency" {
  type        = number
  description = "Jobs processed in parallel per pod (WORKER_CONCURRENCY)"
  default     = 10
}

variable "max_replicas" {
  type        = number
  description = "Upper bound for KEDA scaling"
  default     = 100
}
