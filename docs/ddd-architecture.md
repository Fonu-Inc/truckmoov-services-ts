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

`fleet/vehicles` follows DDD layering:
- `apps/fleet/src/contexts/fleet/vehicles/domain/*`
- `apps/fleet/src/contexts/fleet/vehicles/application/*`
- `apps/fleet/src/contexts/fleet/vehicles/infrastructure/*`

`fleet/drivers` follows the same layering:
- `apps/fleet/src/contexts/fleet/drivers/domain/*`
- `apps/fleet/src/contexts/fleet/drivers/application/*`
- `apps/fleet/src/contexts/fleet/drivers/infrastructure/*`

`fleet/jobs` has an explicit application use-case + publisher port for event emission:
- `apps/fleet/src/contexts/fleet/jobs/domain/*`
- `apps/fleet/src/contexts/fleet/jobs/application/*`
- `apps/fleet/src/contexts/fleet/jobs/infrastructure/*`

Fleet interface entrypoint remains `apps/fleet/src/fleet.controller.ts`.

Current behavior unchanged at API level:
- `GET /fleet/vehicles`
- `POST /fleet/vehicles`
- `GET /fleet/vehicles/:id`
- `PATCH /fleet/vehicles/:id`
- `DELETE /fleet/vehicles/:id`

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
