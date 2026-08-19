import type { INestApplicationContext } from "@nestjs/common";
import { DiscoveryService, Reflector } from "@nestjs/core";
import { PUBLIC_ROUTE_KEY } from "@shared/rbac";
import { TENANT_SCOPED_KEY } from "./tenant-scoped.decorator";

// Fail-closed net for the opt-in @TenantScoped() model: a controller lacking
// both @TenantScoped() and @Public() aborts boot instead of silently losing
// tenant isolation.
export function assertTenantScopedControllers(app: INestApplicationContext): void {
  const discovery = app.get(DiscoveryService);
  const reflector = app.get(Reflector);

  const offenders: string[] = [];
  for (const wrapper of discovery.getControllers()) {
    const metatype = wrapper.metatype as (Function & { name?: string }) | undefined;
    if (!metatype) continue;
    const scoped = reflector.get<boolean>(TENANT_SCOPED_KEY, metatype) === true;
    const isPublic = reflector.get<boolean>(PUBLIC_ROUTE_KEY, metatype) === true;
    if (!scoped && !isPublic) offenders.push(metatype.name ?? "UnknownController");
  }

  if (offenders.length > 0) {
    throw new Error(
      `Tenant isolation misconfiguration: controller(s) [${offenders.join(", ")}] must carry `
        + `@TenantScoped() or be explicitly marked @Public()/@SkipTenantScope().`,
    );
  }
}
