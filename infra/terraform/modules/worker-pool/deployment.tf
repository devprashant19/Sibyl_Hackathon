resource "kubernetes_deployment" "sibyl_worker" {
  metadata {
    name      = "sibyl-worker"
    namespace = local.namespace
    labels = {
      app    = "sibyl-worker"
      region = var.region_name
    }
  }

  spec {
    # Replicas are managed by the KEDA ScaledObject; Terraform must not reset them.
    selector {
      match_labels = {
        app = "sibyl-worker"
      }
    }

    template {
      metadata {
        labels = {
          app    = "sibyl-worker"
          region = var.region_name
        }
      }

      spec {
        container {
          name  = "worker"
          image = var.image

          env {
            name = "REDIS_URL"
            value_from {
              secret_key_ref {
                name = kubernetes_secret.redis.metadata[0].name
                key  = "REDIS_URL"
              }
            }
          }
          # Read by KEDA (passwordFromEnv), not by the worker.
          env {
            name = "REDIS_PASSWORD"
            value_from {
              secret_key_ref {
                name = kubernetes_secret.redis.metadata[0].name
                key  = "REDIS_PASSWORD"
              }
            }
          }
          env {
            name  = "WORKER_CONCURRENCY"
            value = tostring(var.worker_concurrency)
          }

          resources {
            limits = {
              cpu    = "1000m"
              memory = "2Gi"
            }
            requests = {
              cpu    = "200m"
              memory = "512Mi"
            }
          }
        }
      }
    }
  }

  # KEDA may scale to zero, so don't wait for a rollout, and don't fight KEDA over replicas.
  wait_for_rollout = false

  lifecycle {
    ignore_changes = [spec[0].replicas]
  }
}
