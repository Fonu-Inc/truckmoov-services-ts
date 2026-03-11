# DDD / Clean Architecture (services-ts)

## Bounded contexts
- `auth`: identity, session, token lifecycle.
- `fleet`: vehicles, drivers, fleet operations.

## Layering convention
Each bounded context should follow:
- `domain`: entities, value objects, domain errors, repository interfaces.
- `application`: use-cases that coordinate domain behavior.
- `infrastructure`: adapters (DB/event bus/external providers).
- `interface`: transport adapters (HTTP controllers, gRPC handlers).

## Implemented vertical slices
`auth/session` follows DDD layering:
- `apps/auth/src/contexts/auth/session/domain/*`
- `apps/auth/src/contexts/auth/session/application/*`
- `apps/auth/src/contexts/auth/session/infrastructure/*`
- Interface entrypoint remains `apps/auth/src/auth.controller.ts`.

Within `auth/session`, the current vertical slices include:
- identity/session lifecycle (`login`, `refresh`, `logout`, `me`, registration flows)
- user profile management (`/auth/profile`)
- notification preferences (`/auth/preferences/notifications`)
- dispatcher schedule/timezone preferences (`/auth/preferences/dispatch`)
- tenant organization settings for enterprise admins (`/auth/organization/settings`)

`fleet/vehicles` follows DDD layering:
- `apps/fleet/src/contexts/fleet/vehicles/domain/*`
- `apps/fleet/src/contexts/fleet/vehicles/application/*`
- `apps/fleet/src/contexts/fleet/vehicles/infrastructure/*`

`fleet/vehicles` now includes:
- vehicle inventory CRUD
- driver-to-vehicle assignment/unassignment
- activation/deactivation status transitions
- GPS device registration/mapping
- bulk import upsert by plate number

`fleet/drivers` follows the same layering:
- `apps/fleet/src/contexts/fleet/drivers/domain/*`
- `apps/fleet/src/contexts/fleet/drivers/application/*`
- `apps/fleet/src/contexts/fleet/drivers/infrastructure/*`

`fleet/drivers` now includes:
- driver CRUD
- activation/deactivation status transitions
- contact channel management (WhatsApp/SMS/voice)
- bulk import upsert by license number

`fleet/jobs` has an explicit application use-case + publisher port for event emission:
- `apps/fleet/src/contexts/fleet/jobs/domain/*`
- `apps/fleet/src/contexts/fleet/jobs/application/*`
- `apps/fleet/src/contexts/fleet/jobs/infrastructure/*`

`fleet/jobs` now includes:
- event publication (`job.status.changed`)
- queryable job status snapshot repository for dispatch search/filter UX

Fleet interface entrypoint remains `apps/fleet/src/fleet.controller.ts`.

Fleet API behavior (Epic C-aligned):
- `GET /fleet/vehicles`
- `POST /fleet/vehicles`
- `GET /fleet/vehicles/:id`
- `PATCH /fleet/vehicles/:id`
- `DELETE /fleet/vehicles/:id`
- `POST /fleet/vehicles/import`
- `PATCH /fleet/vehicles/:id/status`
- `PATCH /fleet/vehicles/:id/assignment`
- `DELETE /fleet/vehicles/:id/assignment`
- `PATCH /fleet/vehicles/:id/gps-device`
- `GET /fleet/drivers`
- `POST /fleet/drivers`
- `GET /fleet/drivers/:id`
- `PATCH /fleet/drivers/:id`
- `DELETE /fleet/drivers/:id`
- `POST /fleet/drivers/import`
- `PATCH /fleet/drivers/:id/status`
- `PATCH /fleet/drivers/:id/contact-channels`
- `GET /fleet/jobs`
- `GET /fleet/dispatch/search`
- `POST /fleet/events/job-status`

Added auth API behavior:
- `GET/PATCH /auth/profile`
- `GET/PATCH /auth/preferences/notifications`
- `GET/PATCH /auth/preferences/dispatch` (dispatcher role required)
- `GET/PATCH /auth/organization/settings` (enterprise admin role required)

## Current verification coverage
- Unit tests:
  - `tests/unit/auth/login-refresh.use-cases.test.ts`
  - `tests/unit/fleet/driver.use-cases.test.ts`
  - `tests/unit/fleet/job-status-event-publisher.test.ts`
- Interface contract tests:
  - `tests/interface/auth/auth-http.contract.test.ts`
  - `tests/interface/fleet/fleet-http.contract.test.ts`

## Next DDD slices
1. Add domain-level value objects (ID/tenant/status) to tighten invariants.
2. Add repository contract tests that run the same use-case suite against both in-memory and MikroORM adapters.
3. Introduce explicit domain events/outbox boundaries for auth and fleet write use-cases.
