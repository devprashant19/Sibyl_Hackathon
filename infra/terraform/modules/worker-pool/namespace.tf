resource "kubernetes_namespace" "worker_pool" {
  count = var.create_namespace ? 1 : 0

  metadata {
    name = var.namespace
  }
}

locals {
  namespace = var.create_namespace ? kubernetes_namespace.worker_pool[0].metadata[0].name : var.namespace

  # Split redis_url into the pieces KEDA's redis scaler wants (it takes host:port, not a URL).
  # Unmatched optional groups may come back as null or "", so both are normalised to "".
  redis_parts    = regex("^(rediss?)://(?:([^:@/]*)(?::([^@/]*))?@)?([^/?#]+)(?:/([0-9]+))?", var.redis_url)
  redis_tls      = local.redis_parts[0] == "rediss"
  redis_password = local.redis_parts[2] == null ? "" : local.redis_parts[2]
  redis_address  = local.redis_parts[3]
  redis_db       = local.redis_parts[4] == null || local.redis_parts[4] == "" ? "0" : local.redis_parts[4]
}

# The URL may carry a password, so it lives in a Secret rather than in the Deployment spec.
resource "kubernetes_secret" "redis" {
  metadata {
    name      = "sibyl-worker-redis"
    namespace = local.namespace
  }

  data = {
    REDIS_URL      = var.redis_url
    REDIS_PASSWORD = local.redis_password
  }
}
