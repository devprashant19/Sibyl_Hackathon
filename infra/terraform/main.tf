terraform {
  required_providers {
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.23.0"
    }
  }
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
  # In reality, this URL comes from the control_plane module outputs
  redis_url   = "redis://redis.sibyl-system.svc.cluster.local:6379" 
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
  
  # Connects back to the Primary Region's Redis over public internet (or VPC peering)
  redis_url   = "redis://control-plane-redis.primary-region.sibyl.com:6379" 
}
