import { describe, expect, it } from "vitest";
import { ForbiddenException, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { firstValueFrom, throwError } from "rxjs";
import { HideForbiddenInterceptor, PortalGuard, Portals, type Caller, type Refusal } from "@shared/access";

class TenantRoutes {
  @Portals("tenant")
  list() {}

  undeclared() {}

  @Portals("public")
  open() {}
}

function context(handler: () => void, req = { method: "GET", originalUrl: "/fleet/things", headers: {}, ip: "10.0.0.9" }) {
  return {
    getType: () => "http",
    getHandler: () => handler,
    getClass: () => TenantRoutes,
    switchToHttp: () => ({ getRequest: () => req }),
  } as never;
}

function guard(caller: Caller, enforce: boolean) {
  const refusals: Refusal[] = [];
  const g = new PortalGuard(new Reflector(), { resolve: async () => caller }, { report: (r) => refusals.push(r) }, enforce);
  return { g, refusals };
}

describe("the portal rule", () => {
  it("lets a route's own audience through", async () => {
    await expect(guard("tenant", true).g.canActivate(context(TenantRoutes.prototype.list))).resolves.toBe(true);
  });

  it("answers another portal exactly as the router answers a missing route", async () => {
    const { g, refusals } = guard("admin", true);

    const error = await g.canActivate(context(TenantRoutes.prototype.list)).catch((e) => e);

    expect(error).toBeInstanceOf(NotFoundException);
    expect(error.getResponse()).toEqual({ message: "Cannot GET /fleet/things", error: "Not Found", statusCode: 404 });
    expect(refusals).toEqual([
      { method: "GET", path: "/fleet/things", ip: "10.0.0.9", caller: "admin", reason: "audience_not_served" },
    ]);
  });

  it("refuses a route that declares no audience", async () => {
    const { g, refusals } = guard("tenant", true);

    await expect(g.canActivate(context(TenantRoutes.prototype.undeclared))).rejects.toBeInstanceOf(NotFoundException);
    expect(refusals[0].reason).toBe("undeclared_route");
  });

  it("tells an expired token to refresh rather than hiding the route", async () => {
    await expect(guard("unverified", true).g.canActivate(context(TenantRoutes.prototype.list))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it("refuses nothing and blocks nobody until enforcement is on", async () => {
    const { g, refusals } = guard("admin", false);

    await expect(g.canActivate(context(TenantRoutes.prototype.list))).resolves.toBe(true);
    expect(refusals).toHaveLength(0);
  });

  it("opens public routes to anyone", async () => {
    await expect(guard("public", true).g.canActivate(context(TenantRoutes.prototype.open))).resolves.toBe(true);
  });
});

describe("refusals inside handlers", () => {
  function run(enforce: boolean) {
    const { g, refusals } = guard("tenant", enforce);
    const interceptor = new HideForbiddenInterceptor(g, { resolve: async () => "tenant" }, enforce);
    const next = { handle: () => throwError(() => new ForbiddenException("You lack the approve permission")) };
    return { result: firstValueFrom(interceptor.intercept(context(TenantRoutes.prototype.list), next)), refusals };
  }

  it("answer as a missing route, with no hint of why", async () => {
    const { result, refusals } = run(true);

    const error = await result.catch((e) => e);

    expect(error).toBeInstanceOf(NotFoundException);
    expect(JSON.stringify(error.getResponse())).not.toContain("permission");
    expect(refusals[0].reason).toBe("forbidden");
  });

  it("keep their answer until enforcement is on", async () => {
    await expect(run(false).result).rejects.toBeInstanceOf(ForbiddenException);
  });
});

