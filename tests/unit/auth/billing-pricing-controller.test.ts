import "reflect-metadata";
import { describe, expect, it } from "vitest";
import { PATH_METADATA, METHOD_METADATA } from "@nestjs/common/constants";
import { RequestMethod } from "@nestjs/common";
import { PERMISSION_CATALOG, PORTALS_KEY, REQUIREMENT_KEY, neededPermissions, type Requirement } from "@shared/access";
import { SystemBillingPricingController } from "../../../apps/auth/src/system-billing-pricing.controller";

type Route = { method: string; path: string; permissions: string[] };

function routes(): Route[] {
  const proto = SystemBillingPricingController.prototype as unknown as Record<string, object>;
  const classRequirement = Reflect.getMetadata(REQUIREMENT_KEY, SystemBillingPricingController) as Requirement;
  return Object.getOwnPropertyNames(proto)
    .filter((name) => name !== "constructor" && Reflect.hasMetadata(METHOD_METADATA, proto[name]))
    .map((name) => {
      const handler = proto[name];
      const method = RequestMethod[Reflect.getMetadata(METHOD_METADATA, handler)];
      const requirement = (Reflect.getMetadata(REQUIREMENT_KEY, handler) ?? classRequirement) as Requirement;
      return {
        method,
        path: Reflect.getMetadata(PATH_METADATA, handler),
        permissions: neededPermissions(requirement, method),
      };
    });
}

describe("System billing pricing routes", () => {
  it("serves under system/billing in the admin portal", () => {
    expect(Reflect.getMetadata(PATH_METADATA, SystemBillingPricingController)).toBe("system/billing");
    expect(Reflect.getMetadata(PORTALS_KEY, SystemBillingPricingController)).toEqual(["admin"]);
  });

  it("guards every route with a billing permission: read for GET, manage for changes", () => {
    const all = routes();
    expect(all).toHaveLength(9);
    for (const route of all) {
      const expected = route.method === "GET" ? "admin.billing.read" : "admin.billing.manage";
      expect(route.permissions, `${route.method} ${route.path}`).toEqual([expected]);
    }
  });

  it("exposes exactly the intended routes and no delete", () => {
    expect(routes().map((r) => `${r.method} ${r.path}`).sort()).toEqual([
      "GET installation-price",
      "GET plans",
      "GET plans/:code",
      "GET price-history",
      "PATCH plans/:code",
      "POST plans",
      "POST plans/:code/activate",
      "POST plans/:code/deactivate",
      "PUT installation-price",
    ]);
  });

  it("only uses permissions that exist in the catalogue", () => {
    const known = new Set<string>(PERMISSION_CATALOG.map((p) => p.key));
    for (const route of routes()) {
      for (const permission of route.permissions) expect(known.has(permission)).toBe(true);
    }
  });
});
