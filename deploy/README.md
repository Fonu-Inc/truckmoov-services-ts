# Auth deployment

This repo now contains CI/CD for the TypeScript auth service only.

## GitHub Actions flow

- `pull_request`: runs lint, tests, and build for auth-related changes.
- `push` to `main`: runs validation, builds `Dockerfile.auth`, pushes the image to GHCR, then deploys over SSH.
- `workflow_dispatch`: lets you trigger the same pipeline manually.

The workflow uses these repository secrets:

- `DEV_SSH_HOST`
- `DEV_SSH_USER`
- `DEV_SSH_KEY`

## Remote host requirements

The SSH target must already have:

- `kubectl` installed
- kubeconfig/context pointed at the target cluster
- the `truckmoov` namespace already created on the cluster
- permission to deploy into the `truckmoov` namespace
- the `/var/www/truckmoov-services-ts` directory already created on the host
- write access to `/var/www/truckmoov-services-ts`

The workflow copies the rendered auth kustomize bundle to:

- `/var/www/truckmoov-services-ts`

## Kubernetes manifests

`deploy/k8s/auth` defines:

- `Service` named `auth-service`
- `Deployment` named `auth-service`
- `ConfigMap` named `truckmoov-auth-config`
- optional secret contract via `secret.example.yaml`

Kong can already route to `http://auth-service:3001`, so once this workload is applied, the gateway can reach it without changing the Kong config.

## Image pulls

The workflow publishes to:

- `ghcr.io/<github-owner>/truckmoov-auth:sha-<commit>`
- `ghcr.io/<github-owner>/truckmoov-auth:latest` on `main`

The GHCR owner segment must be lowercase in the final image reference.

If the package is private, add an `imagePullSecrets` entry to the deployment and create the matching registry secret in the cluster. If the package is public, no extra registry secret is required.

## Auth secrets

Create the auth secret before the first production-like deploy:

```bash
kubectl apply -f deploy/k8s/auth/secret.example.yaml
```

Then replace the placeholder values with real credentials.
