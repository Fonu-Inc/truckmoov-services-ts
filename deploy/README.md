# Auth deployment

This repo deploys the TypeScript auth service to the existing Kubernetes cluster on the deploy host by building the Docker image on that host and loading it into the local `k3s` runtime.

## GitHub Actions flow

- `pull_request`: runs lint, tests, and build for auth-related changes.
- `push` to `main`: runs validation, copies the tracked source tree and rendered auth kustomize bundle to the deploy host, builds the auth Docker image on that host, imports it into `k3s`, and applies it with `kubectl`.
- `workflow_dispatch`: lets you trigger the same pipeline manually.

The workflow uses these repository secrets:

- `DEV_SSH_HOST`
- `DEV_SSH_USER`
- `DEV_SSH_KEY`

## Remote host requirements

The SSH target must already have:

- Docker installed and usable by the SSH user
- `kubectl` installed
- kubeconfig/context pointed at the target cluster
- the `truckmoov` namespace already created on the cluster
- permission to deploy into the `truckmoov` namespace
- write access to `/var/www/truckmoov-services-ts`
- passwordless `sudo` for `/usr/local/bin/k3s ctr images import -`

## Server layout

The deploy workflow manages these paths on the remote host:

- tracked source tree: `/var/www/truckmoov-services-ts/source/<git-sha>`
- rendered auth bundle: `/var/www/truckmoov-services-ts/rendered/<git-sha>`

## Kubernetes manifests

`deploy/k8s/auth` defines:

- `Service` named `auth-service`
- `Deployment` named `auth-service`
- `ConfigMap` named `truckmoov-auth-config`
- optional secret contract via `secret.example.yaml`

Kong in the platform repo already routes `/auth` to `http://auth-service:3001`, so once this workload is healthy the gateway can reach it inside the cluster.

## Image pulls

The workflow builds a local image on the deploy host:

- `truckmoov-auth:sha-<commit>`

The deployment uses `imagePullPolicy: Never`, so the image must be built and imported into the local `k3s` runtime before `kubectl apply`.

## Auth secrets

Create the auth secret before the first production-like deploy:

```bash
kubectl apply -f deploy/k8s/auth/secret.example.yaml
```

Then replace the placeholder values with real credentials.
