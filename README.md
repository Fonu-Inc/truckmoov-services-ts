# truckmoov-services-ts

NestJS monorepo containing:

- Auth service (`:3001`)
- Fleet service (`:3002`)

## Quick start

```bash
cp .env.example .env
pnpm install
pnpm dev
```

Persistence backend selection:

- `PERSISTENCE_BACKEND=mikro-orm` (default, durable adapters)
- `PERSISTENCE_BACKEND=in-memory` (fast local/test mode)

CORS selection:

- `CORS_ALLOWED_ORIGINS` accepts comma-separated origins.
- Default local value allows web + Kong dev hosts (`localhost` / `127.0.0.1` on `5173` and `8000`).
- Default invite email frontend route is `INVITE_ACCEPT_PATH=/auth/invite`.

## Environment variables

Core vars used by both services:

- `AUTH_PORT`, `FLEET_PORT`: HTTP ports for the two Nest apps.
- `NODE_ENV`: environment name.
- `PERSISTENCE_BACKEND`: `mikro-orm` for durable storage, `in-memory` for fast local/demo runs.
- `DEFAULT_TENANT`: fallback tenant when a request path does not supply one.
- `CORS_ALLOWED_ORIGINS`: comma-separated browser origins.
- `JWT_SECRET`: auth token signing secret.
- `NATS_URL`, `NATS_STREAM`: event bus connection for fleet and auth integrations. Use a JetStream-safe stream name such as `truckmoov_events`.

Database vars:

- `POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`
- Required whenever `PERSISTENCE_BACKEND=mikro-orm`.

Auth-specific delivery vars:

- `FRONTEND_URL`: base URL used to build invite and verification links. Local default should match the Vite app (`http://localhost:5173`).
- `EMAIL_VERIFICATION_PATH`, `INVITE_ACCEPT_PATH`: frontend routes appended to `FRONTEND_URL`.
- `MAIL_TRANSPORT`: `smtp`, `ses`, or `null`.
- `MAIL_FROM`, `AWS_REGION`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`
- `DOTGO_BASE_URL`, `DOTGO_TRANSACTIONAL_ACCOUNT_ID`, `DOTGO_TRANSACTIONAL_API_TOKEN`, `DOTGO_TRANSACTIONAL_SENDER_MASK`, `DOTGO_CALLBACK_URL`, `DOTGO_WEBHOOK_SECRET`, `OTP_DEDUP_WINDOW_S`: the unified OTP/SMS endpoint in auth. The transactional account is the one that actually sends OTPs.
- `MTN_API_BASE_URL`, `MTN_X_API_KEY`, `MTN_M2M_NODE_ID`, `MTN_COUNTRY_CODE`, `MTN_M2M_PRODUCT_MATCH`: MTN's M2M product/customer API. The client sends `x-api-Key`, `x-country-code` and `transactionId` on every call. The background sync only imports products whose name/category/description matches `MTN_M2M_PRODUCT_MATCH` (default `m2m|machine`), so consumer bundles are not written into the M2M catalogue. Set `MTN_BUNDLE_SYNC_ENABLED=false` to disable it.

SMS goes through `POST /auth/internal/otp/send`. Onboarding calls the service in-process; notification, fleet and other services call the route with a service token. The controller/service/provider live in `apps/auth/src/contexts/otp/` and are the first candidate for extraction into their own microservice.
- `SUPERADMIN_EMAIL`, `SUPERADMIN_PASSWORD`: when set, auth bootstraps a `SUPER_ADMIN` account on startup.
- `SUPERADMIN_FULL_NAME`, `SUPERADMIN_TENANT_ID`: optional overrides for the seeded superadmin profile. Recommended tenant ID is `system`.

Payment checkout vars:

- `PAYMENT_DEMO_MODE` — defaults to `true`: the onboarding application, subscription, invoice-card and wallet-top-up flows settle server-side and never open Paystack. Set it to `false` to send customers to Paystack again; the onboarding application page must also restore its billing-email verification block, which the demo flow removes.
- `PAYSTACK_BASE_URL`, `PAYSTACK_SECRET_KEY` — used only when demo mode is off.

Fleet runtime and webhook vars:

- `ALERT_ESCALATION_MINUTES`, `DOCUMENT_RETENTION_DAYS`
- `RATE_LIMIT_RPS`, `RATE_LIMIT_BURST`, `VEHICLE_HEALTH_THRESHOLD_MS`
- `CPAAS_WEBHOOK_SECRET`, `CPAAS_IP_ALLOWLIST`, `ERP_WEBHOOK_SECRET`

Shared integrations:

- `OBJECT_STORAGE_PROVIDER`, `OBJECT_STORAGE_REGION`, `OBJECT_STORAGE_ENDPOINT`
- `OBJECT_STORAGE_BUCKET`, `OBJECT_STORAGE_PUBLIC_BUCKET`, `OBJECT_STORAGE_ACCESS_KEY`, `OBJECT_STORAGE_SECRET_KEY`
- `OBJECT_STORAGE_FORCE_PATH_STYLE`, `OBJECT_STORAGE_PUBLIC_BASE_URL`, `OBJECT_STORAGE_PREFIX`
- `OBJECT_STORAGE_PUBLIC_BUCKET` + `OBJECT_STORAGE_PUBLIC_BASE_URL` are what make auth media uploads return stable public URLs instead of short-lived presigned URLs. Leave them empty if the bucket must stay private.
- `SENTRY_DSN`, `SENTRY_ENVIRONMENT`

Local recommendation:

- use `PERSISTENCE_BACKEND=mikro-orm` when you want the full local stack against Postgres
- use `MAIL_TRANSPORT=null` and leave `DOTGO_TRANSACTIONAL_*` empty if you only need app behavior without live delivery providers

Run quality checks:

```bash
pnpm lint
pnpm build
pnpm test:unit
pnpm test:interface
pnpm test
```

## Health endpoints

- `GET http://localhost:3001/auth/health`
- `GET http://localhost:3002/fleet/health`
- `GET http://localhost:3001/docs/auth`
- `GET http://localhost:3002/docs/fleet`

## Auth profile/preferences endpoints

- Bootstrapped superadmin login
  - Configure `SUPERADMIN_EMAIL` and `SUPERADMIN_PASSWORD`.
  - Start the auth service once and the account will be created or repaired automatically.
  - Tenant users continue to use `POST /auth/login`.
  - Superadmin and system-admin accounts both use `POST /auth/system/login` and are rejected by the tenant login endpoint.
- `GET /auth/invite/validate?token=...`
- `POST /auth/register/invited`
  The invite token is authoritative for the email address. The client should send `inviteToken`, `fullName`, and `password`.
  Invitation emails now link to `/auth/invite` with both `invite` and `email` query params so the frontend can display the invited address before submission.
- `GET /auth/profile`
- `PATCH /auth/profile`
- `GET /auth/organization/users`
  Returns each tenant user with `accountStatus` (`enabled` or `disabled`), plus `status` (`active` or `inactive`) and `lastActiveAt`, derived from auth session activity.
- `PATCH /auth/organization/users/:userId`
- `PATCH /auth/organization/users/:userId/status`
  Enterprise-admin-only account enable/disable endpoint. Disabling revokes active sessions immediately and blocks further login.
- `DELETE /auth/organization/users/:userId`
- `POST /auth/organization/invites/resend`
- `GET /auth/preferences/notifications`
- `PATCH /auth/preferences/notifications`
- `GET /auth/preferences/dispatch` (dispatcher role)
- `PATCH /auth/preferences/dispatch` (dispatcher role)
- `GET /auth/organization/settings` (authenticated tenant user)
- `PATCH /auth/organization/settings` (enterprise admin role)

## Fleet master data endpoints (Epic C)

- Vehicles
  - `GET /fleet/vehicles?query=&status=&assigned=`
  - `GET /fleet/devices?query=&manufacturer=&status=&lifecycleStatus=&assigned=`
    Returns the standalone IoT/GPS device inventory used by the Devices page, including lifecycle state, assignment state, and latest signal/heartbeat snapshots when available.
  - `POST /fleet/devices`
    Registers a standalone device inventory record with `imei`, `manufacturer`, `model`, and `firmwareVersion`. Tenant scope is derived from the bearer token.
  - `POST /fleet/devices/import`
  - `GET /fleet/devices/:id`
  - `PATCH /fleet/devices/:id`
  - `PATCH /fleet/devices/:id/lifecycle`
  - `GET /fleet/devices/:id/assignment/validate?vehicleId=`
  - `PATCH /fleet/devices/:id/assignment`
  - `DELETE /fleet/devices/:id/assignment`
  - `DELETE /fleet/devices/:id`
  - `GET /fleet/gps-devices?query=&vehicleStatus=`
    Legacy alias over the standalone device registry that still returns linked vehicle metadata for older consumers.
  - `POST /fleet/vehicles`
    Accepts the fleet UI vehicle shape: `registrationNumber`, `vin`, `make`, `model`, `year`, `type`, `capacity`, and optional `status`. Tenant scope is derived from the bearer token. Legacy `plateNumber` is still accepted.
  - `POST /fleet/vehicles/import`
  - `GET /fleet/vehicles/:id`
  - `PATCH /fleet/vehicles/:id`
  - `PATCH /fleet/vehicles/:id/status`
  - `PATCH /fleet/vehicles/:id/assignment`
  - `DELETE /fleet/vehicles/:id/assignment`
  - `PATCH /fleet/vehicles/:id/gps-device`
    Accepts the fleet UI GPS-device shape: `imei`, `manufacturer`, `model`, and `firmwareVersion`. The backend persists the install timestamp automatically unless `installedAt` is supplied by a back-office client.
  - `DELETE /fleet/vehicles/:id`
- Drivers
  - `GET /fleet/drivers?query=&status=&assigned=`
  - `POST /fleet/drivers`
    Accepts the fleet UI driver shape: `firstName`, `lastName`, `phone`, `email`, `licenseNumber`, `licenseExpiryDate`, `status`, and `communicationPreference`. Tenant scope is derived from the bearer token. Legacy `name` and `inactive` status input are still accepted for backward compatibility.
  - `POST /fleet/drivers/import`
  - `GET /fleet/drivers/:id`
  - `PATCH /fleet/drivers/:id`
  - `PATCH /fleet/drivers/:id/status`
  - `PATCH /fleet/drivers/:id/contact-channels`
  - `DELETE /fleet/drivers/:id`
- Jobs / Dispatch
  - `GET /fleet/jobs?query=&status=`
  - `GET /fleet/dispatch/search?query=&vehicleStatus=&driverStatus=&jobStatus=&assignedOnly=`
  - `POST /fleet/events/job-status?jobId=&status=`

## Through Kong

With `truckmoov-platform` running:

- `GET http://localhost:8000/auth/health`
- `GET http://localhost:8000/fleet/health`
- `GET http://localhost:8000/docs`
- `GET http://localhost:8000/docs/auth`
- `GET http://localhost:8000/docs/fleet`

## Migration strategy

MikroORM is the chosen migration strategy for this bootstrap.

## DDD notes

- Bounded contexts: `auth`, `fleet`
- DDD architecture guide: `docs/ddd-architecture.md`
- Implemented layered slices:
  - `apps/auth/src/contexts/auth/session`
    - includes profile, notification preferences, dispatcher schedule/timezone, and tenant organization settings use-cases
  - `apps/fleet/src/contexts/fleet/devices`
    - standalone device inventory, lifecycle transitions, assignment validation, and vehicle mapping sync
  - `apps/fleet/src/contexts/fleet/vehicles`
  - `apps/fleet/src/contexts/fleet/drivers`
  - `apps/fleet/src/contexts/fleet/jobs`
  - includes assignment management, activation/deactivation, bulk import, contact channels, GPS mapping, and dispatcher search filters
- Durable adapters implemented behind ports:
  - `apps/auth/src/contexts/auth/session/infrastructure/mikro-session.store.ts`
  - `apps/fleet/src/contexts/fleet/*/infrastructure/repositories/mikro-*.repository.ts`

## Asymmetric user-token signing (EdDSA / Ed25519)

Auth signs user access tokens with either HMAC (legacy, default) or EdDSA. All
services dual-verify: 3-segment JWTs are checked against the auth JWKS
(`GET /auth/.well-known/jwks.json`, kid → public key); 2-segment legacy tokens
keep verifying with the shared HMAC secret. Nothing changes until
`JWT_SIGNING_MODE` is flipped to `asymmetric`.

### Generate a keypair

```
node scripts/generate-jwt-keypair.mjs
```

### Doppler config

Signer (auth only):
- `JWT_PRIVATE_KEY` — Ed25519 PKCS8 PEM from the script (secret; never commit)
- `JWT_KEY_ID` — the `kid` the script prints
- `JWT_SIGNING_MODE` — `hmac` (default) or `asymmetric`

Verifiers (auth + fleet):
- `JWKS_URL` — default `http://auth-service:3001/auth/.well-known/jwks.json`
- `JWT_ISSUER` — default `truckmoov-auth`
- `JWT_AUDIENCE` — default `truckmoov-services`
- `JWT_SECRET` — unchanged, still used for legacy HMAC verify

Rollout: set the key vars everywhere with `JWT_SIGNING_MODE=hmac` first (JWKS is
served, dual-verify is live), then flip auth to `asymmetric`. Rotation is
additive — publish the new key alongside the old, then retire the old kid once
no live token references it.
