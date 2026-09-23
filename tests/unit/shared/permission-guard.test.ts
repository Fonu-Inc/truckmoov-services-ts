import { describe, expect, it } from "vitest";
import { NotFoundException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { OnResource, PermissionGuard, Portals, Requires, SignedIn, type PermissionKey } from "@shared/access";

@Portals("tenant")
@OnResource("tenant.vehicles")
class Vehicles {
  list() {}
  @Requires("tenant.dispatch.manage")
  assign() {}
  @SignedIn()
  mine() {}
}

@Portals("service")
class ServiceOnly {
  count() {}
}

class Undeclared {
  @Portals("tenant")
  anything() {}
}

function ctx(cls: object, handler: () => void, method: string) {
  const req = { method, originalUrl: "/fleet/vehicles", headers: {} };
  return {
    getType: () => "http",
    getHandler: () => handler,
    getClass: () => cls,
    switchToHttp: () => ({ getRequest: () => req }),
  } as never;
}

function guard(held: PermissionKey[] | null, enforce = true) {
  const refusals: unknown[] = [];
  const portals = { refuse: (...args: unknown[]) => refusals.push(args) } as never;
  const g = new PermissionGuard(new Reflector(), { permissionsOf: async () => held }, portals, { resolve: async () => "tenant" }, enforce);
  return { g, refusals };
}

describe("the permission rule", () => {
  it("reads need the resource's read permission, changes its manage one", async () => {
    const reader = guard(["tenant.vehicles.read"]).g;

    await expect(reader.canActivate(ctx(Vehicles, Vehicles.prototype.list, "GET"))).resolves.toBe(true);
    await expect(reader.canActivate(ctx(Vehicles, Vehicles.prototype.list, "POST"))).rejects.toBeInstanceOf(NotFoundException);
  });

  it("uses a route's own permission over its controller's resource", async () => {
    await expect(guard(["tenant.dispatch.manage"]).g.canActivate(ctx(Vehicles, Vehicles.prototype.assign, "POST"))).resolves.toBe(true);
  });

  it("lets any signed-in user reach their own things", async () => {
    await expect(guard([]).g.canActivate(ctx(Vehicles, Vehicles.prototype.mine, "PATCH"))).resolves.toBe(true);
  });

  it("refuses a user whose permissions could not be found", async () => {
    await expect(guard(null).g.canActivate(ctx(Vehicles, Vehicles.prototype.list, "GET"))).rejects.toBeInstanceOf(NotFoundException);
  });

  it("refuses a user route that names no permission", async () => {
    const { g, refusals } = guard(["tenant.vehicles.read"]);
    await expect(g.canActivate(ctx(Undeclared, Undeclared.prototype.anything, "GET"))).rejects.toBeInstanceOf(NotFoundException);
    expect(refusals[0]).toEqual(expect.arrayContaining(["undeclared_permission"]));
  });

  it("leaves service-only routes to their callers list", async () => {
    await expect(guard(null).g.canActivate(ctx(ServiceOnly, ServiceOnly.prototype.count, "GET"))).resolves.toBe(true);
  });

  it("refuses nothing until enforced", async () => {
    await expect(guard([], false).g.canActivate(ctx(Vehicles, Vehicles.prototype.list, "POST"))).resolves.toBe(true);
  });
});
