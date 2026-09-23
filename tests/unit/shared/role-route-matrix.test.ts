import { describe, expect, it } from "vitest";
import "reflect-metadata";
import { METHOD_METADATA, MODULE_METADATA } from "@nestjs/common/constants";
import { RequestMethod } from "@nestjs/common";
import { PREDEFINED_ROLES, PORTALS_KEY, REQUIREMENT_KEY, neededPermissions, type Requirement } from "@shared/access";
import { ROLES_KEY, TENANT_ROLES, normalizeRole } from "@shared/rbac";
import { AppModule as FleetModule } from "../../../apps/fleet/src/app.module";

type Ctor = { name: string; prototype: Record<string, unknown> };

function controllers(module: unknown): Ctor[] {
  return (Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, module as object) ?? []) as Ctor[];
}

function meta<T>(key: string, handler: unknown, controller: unknown): T | undefined {
  return (Reflect.getMetadata(key, handler as object) ?? Reflect.getMetadata(key, controller as object)) as T | undefined;
}

type Decision = { route: string; role: string; before: boolean; after: boolean };

/** Every predefined tenant role against every fleet route: allowed by role today, and by permission now. */
function matrix(): Decision[] {
  const decisions: Decision[] = [];
  for (const controller of controllers(FleetModule)) {
    for (const name of Object.getOwnPropertyNames(controller.prototype)) {
      const handler = controller.prototype[name];
      const verb = typeof handler === "function" ? Reflect.getMetadata(METHOD_METADATA, handler) : undefined;
      if (verb === undefined) continue;
      if (!(meta<string[]>(PORTALS_KEY, handler, controller) ?? []).includes("tenant")) continue;
      const requirement = meta<Requirement>(REQUIREMENT_KEY, handler, controller);
      const roles = (meta<string[]>(ROLES_KEY, handler, controller) ?? []).map((r) => normalizeRole(r) ?? r);
      const needed = requirement ? neededPermissions(requirement, RequestMethod[verb as number]) : [];
      for (const role of TENANT_ROLES) {
        const held = PREDEFINED_ROLES[role].permissions;
        decisions.push({
          route: `${controller.name}.${name}`,
          role,
          before: roles.length === 0 || roles.includes(role),
          after: needed.every((p) => held.includes(p)),
        });
      }
    }
  }
  return decisions;
}

describe("predefined roles against every fleet route", () => {
  // Enforcing permissions must not take away anything a role can do today.
  // Where a role gains access, that is the governance team's mapping to review.
  it("takes no access away from any role", () => {
    const lost = matrix().filter((d) => d.before && !d.after).map((d) => `${d.role} loses ${d.route}`);
    expect(lost).toEqual([]);
  });
});
