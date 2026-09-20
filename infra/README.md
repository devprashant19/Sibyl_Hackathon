# Infrastructure

Infrastructure-as-Code for deploying the Sibyl platform to cloud providers.

## Overview

This directory contains Pulumi (TypeScript) and Terraform configurations for provisioning the Sibyl platform infrastructure on AWS, GCP, or Azure. It is used for the Sibyl SaaS deployment and can also serve as a reference for enterprise customers deploying Sibyl in their own cloud accounts.

## Components Provisioned

| Component | Purpose |
|---|---|
| **VPC / Network** | Isolated network with public and private subnets |
| **ECS / GKE / AKS** | Container orchestration for API, Worker, and Dashboard services |
| **RDS / Cloud SQL** | Managed PostgreSQL 15 |
| **ElastiCache / Memorystore** | Managed Redis 7 for BullMQ queues |
| **ALB / Ingress** | Application load balancer with TLS termination |
| **ECR / GCR / ACR** | Container registry for Docker images |
| **CloudWatch / Stackdriver** | Log aggregation |
| **S3 / GCS** | Artifact storage for large simulation results |
| **IAM** | Service accounts and roles with least-privilege policies |

## Usage

### Pulumi

```bash
cd infra
npm install
pulumi up
```

### Terraform

```bash
cd infra/terraform
terraform init
terraform plan
terraform apply
```

## Self-Hosted Deployment

For on-premises or VPC-internal deployments, use the Docker Compose stack in the repository root instead:

```bash
docker-compose up -d
```

See [SELF_HOSTING.md](../SELF_HOSTING.md) for the full self-hosted deployment guide.

## Directory Structure

```
infra/
├── index.ts           # Pulumi entry point
├── Pulumi.yaml        # Pulumi project configuration
├── package.json       # Pulumi dependencies
├── tsconfig.json      # TypeScript configuration
└── terraform/         # Terraform modules (alternative IaC)
```
