# Doppler on k3s

This repo expects the Doppler Kubernetes Operator to be installed on the target k3s cluster. The auth and fleet deployments consume operator-managed Kubernetes secrets in the `truckmoov` namespace:

- `truckmoov-auth-secrets`
- `truckmoov-fleet-secrets`

The base example `DopplerSecret` manifests live here:

- `deploy/k8s/auth/doppler-secret.example.yaml`
- `deploy/k8s/fleet/doppler-secret.example.yaml`

The recommended deploy path is the env-specific kustomize overlays here:

- `deploy/k8s/doppler/overlays/dev`
- `deploy/k8s/doppler/overlays/stg`
- `deploy/k8s/doppler/overlays/prd`

The suggested Doppler layout is:

- project: `truckmoov`
- configs: `dev`, `stg`, `prd`

Populate Doppler with these values.

Auth config:

- `POSTGRES_PASSWORD`
- `JWT_SECRET`
- `CORS_ALLOWED_ORIGINS`
- `SENTRY_DSN`
- `MAIL_FROM`
- `AWS_REGION`
- `DOTGO_API_URL`
- `DOTGO_API_KEY`
- `DOTGO_SENDER_ID`
- `FRONTEND_URL`
- `PAYSTACK_BASE_URL`
- `PAYSTACK_SECRET_KEY`
- `EXCHANGE_RATE_API_KEY`

Fleet config:

- `POSTGRES_PASSWORD`
- `SENTRY_DSN`

Create the Doppler bootstrap token secret in the operator namespace before applying the `DopplerSecret` resources:

```bash
kubectl create secret generic doppler-token-secret \
  --namespace doppler-operator-system \
  --from-literal=serviceToken='<doppler-service-token>'
```

Apply the env-specific Doppler overlay first, then apply the service manifests:

```bash
kubectl apply -k deploy/k8s/doppler/overlays/dev
kubectl apply -k deploy/k8s/auth
kubectl apply -k deploy/k8s/fleet
```

For staging, use `deploy/k8s/doppler/overlays/stg`.
For production, use `deploy/k8s/doppler/overlays/prd`.


## Authorization and admin MFA switches (prepared — flip after log soak)

These are **not** live-set by this repo. Add them in Doppler (or rely on
gitops ConfigMap defaults of `log` / `optional`) and flip when ready.

**Flip order (required):** `PERMISSION_ENFORCEMENT` first, then
`PORTAL_ENFORCEMENT`. Permissions before portal so role bundles and
`@Requires` / `@OnResource` gaps surface while portal soft-allow can still
be diagnosed separately.

| Key | Safe / prepared value | Flip to | Doppler configs |
|---|---|---|---|
| `PERMISSION_ENFORCEMENT` | `log` | `enforce` | `stg_auth`, `stg_fleet`, `stg_realtime`, `stg_notification`, `stg_tracking`, `stg_dispatch` (and `stg` if used) |
| `PORTAL_ENFORCEMENT` | `log` | `enforce` | same as above |
| `ADMIN_TWO_FACTOR` | `optional` | `required` | `stg_auth` only (after admin SPA 2FA code/enrolment step is live) |
| `DOCUMENT_SCAN_REQUIRED` | `false` | `true` | `stg_auth` (only after a real malware scanner is wired) |

Code defaults remain `log` / `optional` / `false` when unset — fail-open for
the log soak by design. Do **not** change code defaults to `enforce` until
would-deny logs and role mappings are clean.

Rollback: set the key back to `log` (or `optional`) in Doppler; pods pick up
via DopplerSecret sync. No image rebuild required.
