resource "kubernetes_deployment" "sibyl_worker" {
  metadata {
    name      = "sibyl-worker"
    namespace = kubernetes_namespace.sibyl.metadata[0].name
    labels = {
      app = "sibyl-worker"
    }
  }

  spec {
    # Replicas managed by KEDA ScaledObject, not hardcoded here
    selector {
      match_labels = {
        app = "sibyl-worker"
      }
    }

    template {
      metadata {
        labels = {
          app = "sibyl-worker"
        }
      }

      spec {
        container {
          name  = "worker"
          image = "sibyl/worker:latest"

          env {
            name  = "REDIS_URL"
            value = "redis://redis.sibyl-system.svc.cluster.local:6379"
          }
          env {
            name  = "WORKER_CONCURRENCY"
            value = "10"
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
}
