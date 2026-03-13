# Service deployment

This repo deploys the TypeScript auth and fleet services to the existing Kubernetes cluster on the deploy host by building the Docker images on that host and loading them into the local `k3s` runtime.

## GitHub Actions flow

- `pull_request`: runs lint, tests, and build for service-related changes.
- `push` to `main`: runs validation, copies the tracked source tree and rendered kustomize bundles to the deploy host, builds the auth and fleet Docker images on that host, imports them into `k3s`, and applies them with `kubectl`.
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
- permission to run `/usr/local/bin/k3s ctr images import -`

## Server layout

The deploy workflow manages these paths on the remote host:

- tracked source tree: `/var/www/truckmoov-services-ts/source/<git-sha>`
- rendered auth bundle: `/var/www/truckmoov-services-ts/rendered/<git-sha>/auth`
- rendered fleet bundle: `/var/www/truckmoov-services-ts/rendered/<git-sha>/fleet`

## Kubernetes manifests

`deploy/k8s/auth` defines:

- `Service` named `auth-service`
- `Deployment` named `auth-service`
- `ConfigMap` named `truckmoov-auth-config`
- Doppler operator manifest example via `doppler-secret.example.yaml`

Kong in the platform repo already routes `/auth` to `http://auth-service:3001`, so once this workload is healthy the gateway can reach it inside the cluster.

`deploy/k8s/fleet` defines:

- `Service` named `fleet-service`
- `Deployment` named `fleet-service`
- `ConfigMap` named `truckmoov-fleet-config`
- Doppler operator manifest example via `doppler-secret.example.yaml`

Expose `/fleet` to `http://fleet-service:3002` from the platform gateway once this workload is healthy.

## Image pulls

The workflow builds a local image on the deploy host:

- `truckmoov-auth:sha-<commit>`
- `truckmoov-fleet:sha-<commit>`

The deployment uses `imagePullPolicy: Never`, so the image must be built and imported into the local `k3s` runtime before `kubectl apply`.

## Doppler-managed secrets

This repo expects the Doppler Kubernetes Operator to create and refresh the runtime Kubernetes secrets consumed by the auth and fleet deployments.

See `deploy/doppler/README.md` for the k3s bootstrap token flow, the expected Doppler project/config layout, and the manifests to apply.
