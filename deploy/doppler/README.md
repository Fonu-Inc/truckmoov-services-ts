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
- `DOTGO_BASE_URL`
- `DOTGO_TRANSACTIONAL_ACCOUNT_ID`
- `DOTGO_TRANSACTIONAL_API_TOKEN`
- `DOTGO_TRANSACTIONAL_SENDER_MASK`
- `DOTGO_CALLBACK_URL`
- `DOTGO_WEBHOOK_SECRET`
- `OTP_DEDUP_WINDOW_S`
- `MTN_API_BASE_URL`
- `MTN_X_API_KEY`
- `MTN_M2M_NODE_ID`
- `MTN_COUNTRY_CODE`
- `MTN_M2M_PRODUCT_MATCH`
- `MTN_API_TIMEOUT_MS`
- `MTN_BUNDLE_SYNC_ENABLED`
- `MTN_BUNDLE_SYNC_INTERVAL_MINUTES`
- `FRONTEND_URL`
- `PAYMENT_DEMO_MODE`
- `PAYSTACK_BASE_URL`
- `PAYSTACK_SECRET_KEY`
- `FONU_COMPANY_UUID`
- `FONU_API_KEY`

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
