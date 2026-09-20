terraform {
  required_providers {
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.23.0"
    }
  }
}

# This configuration does not deploy Redis. Point the worker pools at an existing Redis that the
# control plane's queue producers use (BullMQ queue "simulation-run-queue").
variable "primary_redis_url" {
  type        = string
  description = "Redis URL reachable from the primary cluster, e.g. redis://redis.sibyl-system.svc.cluster.local:6379"
}

variable "eu_central_redis_url" {
  type        = string
  description = "The same Redis, as reachable from the eu-central cluster (VPC peering or TLS endpoint), e.g. rediss://:password@redis.example.com:6380"
}

variable "worker_image" {
  type        = string
  description = "Worker image (docker build -f docker/Dockerfile --target worker .)"
  default     = "sibyl/worker:latest"
}

# ---------------------------------------------------------
# Primary Region (Control Plane)
# ---------------------------------------------------------
provider "kubernetes" {
  alias       = "primary"
  config_path = "~/.kube/config-primary"
}

module "control_plane" {
  source = "./modules/control-plane"
  providers = {
    kubernetes = kubernetes.primary
  }
}

# ---------------------------------------------------------
# Worker Pool: US East (Primary Region)
# ---------------------------------------------------------
module "worker_us_east" {
  source = "./modules/worker-pool"
  providers = {
    kubernetes = kubernetes.primary
  }

  region_name = "us-east-1"
  namespace   = "sibyl-workers-us-east-1"
  redis_url   = var.primary_redis_url
  image       = var.worker_image
}

# ---------------------------------------------------------
# Worker Pool: EU Central (Remote Region)
# ---------------------------------------------------------
provider "kubernetes" {
  alias       = "eu_central"
  config_path = "~/.kube/config-eu-central"
}

module "worker_eu_central" {
  source = "./modules/worker-pool"
  providers = {
    kubernetes = kubernetes.eu_central
  }

  region_name = "eu-central-1"
  namespace   = "sibyl-workers-eu-central-1"
  redis_url   = var.eu_central_redis_url
  image       = var.worker_image
}
