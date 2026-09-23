import { describe, expect, it } from "vitest";
import "reflect-metadata";
import { METHOD_METADATA, MODULE_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import { PORTALS_KEY } from "@shared/access";
import { PUBLIC_ROUTE_KEY } from "@shared/rbac";
import { AppModule as AuthModule } from "../../../apps/auth/src/app.module";
import { AppModule as FleetModule } from "../../../apps/fleet/src/app.module";

type Ctor = { new (...args: never[]): unknown; name: string; prototype: Record<string, unknown> };

function controllersOf(module: unknown, seen = new Set<unknown>()): Ctor[] {
  if (!module || seen.has(module)) return [];
  seen.add(module);
  const target = (module as { module?: unknown }).module ?? module;
  const own = (Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, target as object) ?? []) as Ctor[];
  const imports = (Reflect.getMetadata(MODULE_METADATA.IMPORTS, target as object) ?? []) as unknown[];
  return [...own, ...imports.flatMap((m) => controllersOf(m, seen))];
}

function undeclaredRoutes(module: unknown): string[] {
  const missing: string[] = [];
  for (const controller of controllersOf(module)) {
    const classDeclares =
      Reflect.getMetadata(PORTALS_KEY, controller) !== undefined || Reflect.getMetadata(PUBLIC_ROUTE_KEY, controller) === true;
    for (const name of Object.getOwnPropertyNames(controller.prototype)) {
      const handler = controller.prototype[name];
      if (typeof handler !== "function" || Reflect.getMetadata(METHOD_METADATA, handler) === undefined) continue;
      const methodDeclares =
        Reflect.getMetadata(PORTALS_KEY, handler) !== undefined || Reflect.getMetadata(PUBLIC_ROUTE_KEY, handler) === true;
      if (!classDeclares && !methodDeclares) {
        missing.push(`${controller.name}.${name} (${Reflect.getMetadata(PATH_METADATA, handler)})`);
      }
    }
  }
  return missing;
}

// Every route says who it serves. One that does not is refused at runtime;
// this catches it before it ships.
describe("route inventory", () => {
  it("every auth route declares its audience", () => {
    expect(controllersOf(AuthModule).length).toBeGreaterThan(30);
    expect(undeclaredRoutes(AuthModule)).toEqual([]);
  });

  it("every fleet route declares its audience", () => {
    expect(controllersOf(FleetModule).length).toBeGreaterThan(25);
    expect(undeclaredRoutes(FleetModule)).toEqual([]);
  });
});
