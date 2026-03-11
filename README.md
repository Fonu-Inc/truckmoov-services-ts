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

## Auth profile/preferences endpoints
- `GET /auth/profile`
- `PATCH /auth/profile`
- `GET /auth/preferences/notifications`
- `PATCH /auth/preferences/notifications`
- `GET /auth/preferences/dispatch` (dispatcher role)
- `PATCH /auth/preferences/dispatch` (dispatcher role)
- `GET /auth/organization/settings` (enterprise admin role)
- `PATCH /auth/organization/settings` (enterprise admin role)

## Fleet master data endpoints (Epic C)
- Vehicles
  - `GET /fleet/vehicles?query=&status=&assigned=&tenantId=`
  - `POST /fleet/vehicles`
  - `POST /fleet/vehicles/import`
  - `GET /fleet/vehicles/:id`
  - `PATCH /fleet/vehicles/:id`
  - `PATCH /fleet/vehicles/:id/status`
  - `PATCH /fleet/vehicles/:id/assignment`
  - `DELETE /fleet/vehicles/:id/assignment`
  - `PATCH /fleet/vehicles/:id/gps-device`
  - `DELETE /fleet/vehicles/:id`
- Drivers
  - `GET /fleet/drivers?query=&status=&assigned=&tenantId=`
  - `POST /fleet/drivers`
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
