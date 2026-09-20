# Requires KEDA to be installed in the cluster
# helm repo add kedacore https://kedacore.github.io/charts
# helm install keda kedacore/keda --namespace keda --create-namespace

resource "kubernetes_manifest" "keda_scaled_object" {
  manifest = {
    "apiVersion" = "keda.sh/v1alpha1"
    "kind"       = "ScaledObject"
    "metadata" = {
      "name"      = "sibyl-worker-autoscaler"
      "namespace" = kubernetes_namespace.sibyl.metadata[0].name
    }
    "spec" = {
      "scaleTargetRef" = {
        "apiVersion" = "apps/v1"
        "kind"       = "Deployment"
        "name"       = kubernetes_deployment.sibyl_worker.metadata[0].name
      }
      "minReplicaCount" = 0  # Scale to zero when idle!
      "maxReplicaCount" = 100
      "pollingInterval" = 5
      "cooldownPeriod"  = 60
      "triggers" = [
        {
          "type" = "redis"
          "metadata" = {
            # KEDA queries this Redis address
            "address"        = "redis.sibyl-system.svc.cluster.local:6379"
            # BullMQ uses a specific list for pending jobs
            "listName"       = "bull:simulation-run-queue:wait"
            "listLength"     = "20" # Target 20 pending jobs per worker pod
          }
        }
      ]
    }
  }
}
