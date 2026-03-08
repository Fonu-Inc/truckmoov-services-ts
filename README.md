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
  - `apps/fleet/src/contexts/fleet/vehicles`
  - `apps/fleet/src/contexts/fleet/drivers`
  - `apps/fleet/src/contexts/fleet/jobs`
- Durable adapters implemented behind ports:
  - `apps/auth/src/contexts/auth/session/infrastructure/mikro-session.store.ts`
  - `apps/fleet/src/contexts/fleet/*/infrastructure/repositories/mikro-*.repository.ts`
