terraform {
  required_providers {
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.23.0"
    }
  }
}

# No provider block here: the caller passes one in (`providers = { kubernetes = ... }`). A module
# with its own provider configuration cannot accept an overridden one from its parent.

resource "kubernetes_namespace" "sibyl" {
  metadata {
    name = "sibyl-system"
  }
}

output "namespace" {
  value = kubernetes_namespace.sibyl.metadata[0].name
}
