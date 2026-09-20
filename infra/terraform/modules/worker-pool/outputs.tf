output "namespace" {
  value = local.namespace
}

output "deployment_name" {
  value = kubernetes_deployment.sibyl_worker.metadata[0].name
}
