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
- `SMS_TRANSPORT`, `DOTGO_API_URL`, `DOTGO_API_KEY`, `DOTGO_SENDER_ID`

Fleet runtime and webhook vars:
- `REPORT_INTERVAL_HOURS`, `ALERT_ESCALATION_MINUTES`, `DOCUMENT_RETENTION_DAYS`
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
- use `MAIL_TRANSPORT=null` and `SMS_TRANSPORT=null` if you only need app behavior without live delivery providers

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
- `GET /auth/invite/validate?token=...`
- `POST /auth/register/invited`
  The invite token is authoritative for the email address. The client should send `inviteToken`, `fullName`, and `password`.
  Invitation emails now link to `/auth/invite` with both `invite` and `email` query params so the frontend can display the invited address before submission.
- `GET /auth/profile`
- `PATCH /auth/profile`
- `GET /auth/organization/users`
  Returns each tenant user with `status` (`active` or `inactive`) and `lastActiveAt`, derived from auth session activity.
- `PATCH /auth/organization/users/:userId`
- `DELETE /auth/organization/users/:userId`
- `POST /auth/organization/invites/resend`
- `GET /auth/preferences/notifications`
- `PATCH /auth/preferences/notifications`
- `GET /auth/preferences/dispatch` (dispatcher role)
- `PATCH /auth/preferences/dispatch` (dispatcher role)
- `GET /auth/organization/settings` (enterprise admin role)
- `PATCH /auth/organization/settings` (enterprise admin role)

## Fleet master data endpoints (Epic C)
- Vehicles
  - `GET /fleet/vehicles?query=&status=&assigned=&tenantId=`
  - `GET /fleet/gps-devices?query=&vehicleStatus=&tenantId=`
    Returns GPS devices currently mapped to fleet vehicles, using the UI device fields: `imei`, `manufacturer`, `model`, `firmwareVersion`, plus the linked vehicle and tenant metadata.
  - `POST /fleet/vehicles`
    Accepts the fleet UI vehicle shape: `registrationNumber`, `vin`, `make`, `model`, `year`, `type`, `capacity`, plus `tenantId` and optional `status`. Legacy `plateNumber` is still accepted.
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
  - `GET /fleet/drivers?query=&status=&assigned=&tenantId=`
  - `POST /fleet/drivers`
    Accepts the fleet UI driver shape: `firstName`, `lastName`, `phone`, `email`, `licenseNumber`, `licenseExpiryDate`, `status`, and `communicationPreference`, plus `tenantId`. Legacy `name` and `inactive` status input are still accepted for backward compatibility.
  - `POST /fleet/drivers/import`
  - `GET /fleet/drivers/:id`
  - `PATCH /fleet/drivers/:id`
  - `PATCH /fleet/drivers/:id/status`
  - `PATCH /fleet/drivers/:id/contact-channels`
  - `DELETE /fleet/drivers/:id`
- Jobs / Dispatch
  - `GET /fleet/jobs?query=&status=&tenantId=`
  - `GET /fleet/dispatch/search?query=&vehicleStatus=&driverStatus=&jobStatus=&assignedOnly=&tenantId=`
  - `POST /fleet/events/job-status?jobId=&status=&tenant=`

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
  - `apps/fleet/src/contexts/fleet/vehicles`
  - `apps/fleet/src/contexts/fleet/drivers`
  - `apps/fleet/src/contexts/fleet/jobs`
  - includes assignment management, activation/deactivation, bulk import, contact channels, GPS mapping, and dispatcher search filters
- Durable adapters implemented behind ports:
  - `apps/auth/src/contexts/auth/session/infrastructure/mikro-session.store.ts`
  - `apps/fleet/src/contexts/fleet/*/infrastructure/repositories/mikro-*.repository.ts`
