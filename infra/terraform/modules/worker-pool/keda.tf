# Requires KEDA to be installed in the cluster before `terraform plan` (kubernetes_manifest needs the CRD):
# helm repo add kedacore https://kedacore.github.io/charts
# helm install keda kedacore/keda --namespace keda --create-namespace

resource "kubernetes_manifest" "keda_scaled_object" {
  manifest = {
    "apiVersion" = "keda.sh/v1alpha1"
    "kind"       = "ScaledObject"
    "metadata" = {
      "name"      = "sibyl-worker-autoscaler"
      "namespace" = local.namespace
    }
    "spec" = {
      "scaleTargetRef" = {
        "apiVersion" = "apps/v1"
        "kind"       = "Deployment"
        "name"       = kubernetes_deployment.sibyl_worker.metadata[0].name
      }
      "minReplicaCount" = 0 # Scale to zero when idle
      "maxReplicaCount" = var.max_replicas
      "pollingInterval" = 5
      "cooldownPeriod"  = 60
      "triggers" = [
        {
          "type" = "redis"
          "metadata" = merge(
            {
              # The same Redis the workers consume from (var.redis_url), as host:port.
              "address"       = local.redis_address
              "databaseIndex" = local.redis_db
              "enableTLS"     = tostring(local.redis_tls)
              # BullMQ keeps waiting jobs of queue "simulation-run-queue" in this list.
              "listName"   = "bull:simulation-run-queue:wait"
              "listLength" = "20" # Target 20 pending jobs per worker pod
            },
            # Resolved by KEDA from the scale target's container env (backed by the Secret).
            { for k, v in { "passwordFromEnv" = "REDIS_PASSWORD" } : k => v if local.redis_password != "" },
          )
        }
      ]
    }
  }
}
