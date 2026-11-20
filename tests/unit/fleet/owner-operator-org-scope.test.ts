import { describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
import type { AppConfigService } from "@shared/config";
import { Role } from "@shared/rbac";
import { AuthContextMiddleware } from "../../../apps/fleet/src/auth-context.middleware";
import { ComplianceController } from "../../../apps/fleet/src/compliance.controller";
import { FuelController } from "../../../apps/fleet/src/fuel.controller";
import { VehiclesController } from "../../../apps/fleet/src/vehicles.controller";
import { resolveOverviewScope } from "../../../apps/fleet/src/contexts/fleet/reports/domain/overview-scope";
import { AccessResolver } from "../../../apps/auth/src/access-resolver";
import { InMemoryPermissionRemovalRepository } from "../../../apps/auth/src/in-memory-permission-removal.repository";
import { InMemoryTenantOnboardingRepository } from "../../../apps/auth/src/in-memory-tenant-onboarding.repository";
import { InMemoryTenantRoleRepository } from "../../../apps/auth/src/in-memory-tenant-role.repository";
import { InMemoryUserRepository } from "../../../apps/auth/src/contexts/auth/session/infrastructure/in-memory-user.repository";

const asOwnerOperator = (organizationType?: string | null) =>
  ({ user: { tenantId: "t1", userId: "op-1", role: Role.OWNER_OPERATOR, organizationType } }) as never;

const ownerIdFor = (req: never) =>
  (VehiclesController.prototype as unknown as { ownerOperatorIdFromRequest(r: never): string | undefined }).ownerOperatorIdFromRequest(req);

describe("who an owner operator is limited to, by kind of organisation", () => {
  it("does not limit the owner of an owner-operator organisation", () => {
    expect(ownerIdFor(asOwnerOperator("owner_operator"))).toBeUndefined();
  });

  it.each(["enterprise", "aggregator", "fleet_provider"])(
    "limits an independent owner operator in a %s organisation to their own vehicles",
    (organizationType) => {
      expect(ownerIdFor(asOwnerOperator(organizationType))).toBe("op-1");
    },
  );

  // A failure to find out must narrow access, never widen it.
  it("limits an owner operator whose organisation type is unknown", () => {
    expect(ownerIdFor(asOwnerOperator(undefined))).toBe("op-1");
    expect(ownerIdFor(asOwnerOperator(null))).toBe("op-1");
  });

  it("never limited any other role, whatever the organisation", () => {
    for (const role of [Role.ENTERPRISE_ADMIN, Role.OPERATIONS_MANAGER, Role.DISPATCHER]) {
      const req = { user: { tenantId: "t1", userId: "u", role, organizationType: "enterprise" } } as never;
      expect(ownerIdFor(req)).toBeUndefined();
    }
  });
});

const lister = (rows: Array<Record<string, unknown>>) => ({
  execute: vi.fn(async (query: { ownerOperatorId?: string }) =>
    query.ownerOperatorId ? rows.filter((row) => row["ownerOperatorId"] === query.ownerOperatorId) : rows,
  ),
});

describe("the owner of an owner-operator organisation runs the whole fleet", () => {
  // A teammate added these, so they carry no owner. Under the per-user rule the
  // founder could not see, edit or record fuel on any of them.
  const fleet = lister([
    { id: "v1", ownerOperatorId: null },
    { id: "v2", ownerOperatorId: "a-teammate" },
  ]);

  const fuel = [
    { id: "f1", vehicleId: "v1", liters: 10, totalCost: 1000, fuelType: "diesel", station: "A", pricePerLiter: 100, auditTrail: [], vehiclePlateNumber: "V1", driverName: null, recordedAt: "2026-09-29T10:00:00.000Z" },
    { id: "f2", vehicleId: "v2", liters: 40, totalCost: 4000, fuelType: "diesel", station: "B", pricePerLiter: 100, auditTrail: [], vehiclePlateNumber: "V2", driverName: null, recordedAt: "2026-09-29T11:00:00.000Z" },
  ];

  const fuelController = () =>
    Object.assign(Object.create(FuelController.prototype), {
      listVehiclesUseCase: fleet,
      listFuelRecordsUseCase: { execute: vi.fn(async () => fuel) },
    }) as FuelController;

  it("sees every vehicle's fuel, not only vehicles tagged with their own id", async () => {
    const result = await fuelController().listFuelTransactions({} as never, asOwnerOperator("owner_operator"));

    const rows = (result as unknown as { data: Array<{ vehicleId: string }> }).data;
    expect(rows.map((row) => row.vehicleId)).toEqual(["v1", "v2"]);
  });

  it("is still limited to their own vehicles when they are an independent operator in an enterprise", async () => {
    const result = await fuelController().listFuelTransactions({} as never, asOwnerOperator("enterprise"));

    const rows = (result as unknown as { data: Array<{ vehicleId: string }> }).data;
    expect(rows).toEqual([]);
  });

  it("can open, edit and delete any vehicle in their organisation", async () => {
    const update = vi.fn(async () => ({ id: "v1" }));
    const remove = vi.fn(async () => ({ id: "v1" }));
    const controller = Object.assign(Object.create(VehiclesController.prototype), {
      listVehiclesUseCase: fleet,
      recordActivity: vi.fn(async () => undefined),
      updateVehicleUseCase: { execute: update },
      deleteVehicleUseCase: { execute: remove },
    }) as VehiclesController;

    await controller.updateVehicle("v1", { model: "X" } as never, asOwnerOperator("owner_operator"));
    await controller.deleteVehicle("v2", asOwnerOperator("owner_operator"));

    expect(update).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it("creates vehicles with no owner, since the whole organisation owns them", async () => {
    const create = vi.fn(async () => ({ id: "v9", plateNumber: "A", registrationNumber: "A", model: "M", status: "active" }));
    const controller = Object.assign(Object.create(VehiclesController.prototype), {
      createVehicleUseCase: { execute: create },
      recordActivity: vi.fn(async () => undefined),
    }) as VehiclesController;

    await controller.createVehicle({ model: "M", registrationNumber: "A" } as never, asOwnerOperator("owner_operator"));

    expect(create).toHaveBeenCalledWith(expect.objectContaining({ ownerOperatorId: undefined }));
  });

  it("reads compliance documents across the whole organisation", async () => {
    const vehicleRepository = { findAllByOwnerOperatorId: vi.fn(async () => [{ id: "v-own" }]) };
    const controller = Object.assign(Object.create(ComplianceController.prototype), { vehicleRepository }) as ComplianceController;
    const vehicleIds = (req: never) =>
      (controller as unknown as { ownerOperatorVehicleIds(t: string, r: never): Promise<string[] | undefined> }).ownerOperatorVehicleIds("t1", req);

    expect(await vehicleIds(asOwnerOperator("owner_operator"))).toBeUndefined();
    expect(await vehicleIds(asOwnerOperator("enterprise"))).toEqual(["v-own"]);
    expect(await vehicleIds(asOwnerOperator(undefined))).toEqual(["v-own"]);
  });
});

describe("the overview scope", () => {
  const user = (organizationType?: string | null) => ({ tenantId: "t1", userId: "op-1", role: Role.OWNER_OPERATOR, organizationType });

  it("covers the whole fleet for the owner of an owner-operator organisation", () => {
    expect(resolveOverviewScope(user("owner_operator"))).toEqual({ tenantId: "t1", ownerOperatorId: null });
  });

  it("pins an independent operator to their own records", () => {
    expect(resolveOverviewScope(user("enterprise"))).toEqual({ tenantId: "t1", ownerOperatorId: "op-1" });
    expect(resolveOverviewScope(user(undefined))).toEqual({ tenantId: "t1", ownerOperatorId: "op-1" });
  });
});

describe("auth reports the kind of organisation", () => {
  async function accessFor(organizationType: string | null, role = "OWNER_OPERATOR") {
    const users = new InMemoryUserRepository();
    await users.save({ id: "u1", role, tenantId: "t1", email: "u1@co.com", passwordHash: "x" } as never);
    const onboarding = new InMemoryTenantOnboardingRepository();
    if (organizationType) await onboarding.save({ id: "o1", tenantId: "t1", organizationType } as never);
    const resolver = new AccessResolver(new InMemoryTenantRoleRepository(), new InMemoryPermissionRemovalRepository(), onboarding);
    return resolver.resolve(users, "u1");
  }

  it("gives the organisation type of the user's tenant", async () => {
    expect((await accessFor("owner_operator"))?.organizationType).toBe("owner_operator");
    expect((await accessFor("enterprise"))?.organizationType).toBe("enterprise");
  });

  it("gives null when the tenant has no onboarding record", async () => {
    expect((await accessFor(null))?.organizationType).toBeNull();
  });

  it("gives null when it was built without an onboarding repository", async () => {
    const users = new InMemoryUserRepository();
    await users.save({ id: "u1", role: "OWNER_OPERATOR", tenantId: "t1", email: "u1@co.com", passwordHash: "x" } as never);
    const resolver = new AccessResolver(new InMemoryTenantRoleRepository(), new InMemoryPermissionRemovalRepository());

    expect((await resolver.resolve(users, "u1"))?.organizationType).toBeNull();
  });

  it("treats a failing lookup as unknown, so access narrows and nothing breaks", async () => {
    const users = new InMemoryUserRepository();
    await users.save({ id: "u1", role: "OWNER_OPERATOR", tenantId: "t1", email: "u1@co.com", passwordHash: "x" } as never);
    const failing = { findByTenantId: async () => { throw new Error("db down"); } } as never;
    const resolver = new AccessResolver(new InMemoryTenantRoleRepository(), new InMemoryPermissionRemovalRepository(), failing);

    expect((await resolver.resolve(users, "u1"))?.organizationType).toBeNull();
  });
});

describe("fleet learns the organisation type from auth", () => {
  const token = (payload: Record<string, unknown>) => {
    const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
    return `${body}.${createHmac("sha256", "replace-me").update(body).digest("base64url")}`;
  };

  async function userFor(access: unknown) {
    const middleware = new AuthContextMiddleware(
      {
        auth: { jwtSecret: "replace-me" },
        identity: { signingKey: "", publicKeys: "", legacySecret: "replace-me", serviceTokenDir: "/nonexistent", serviceAuthDevSecret: "" },
      } as unknown as AppConfigService,
      { get: async () => access } as never,
    );
    const req: any = {
      headers: {
        authorization: `Bearer ${token({ sub: "u1", email: "u@co.com", role: "OWNER_OPERATOR", tenantId: "t1", exp: Math.floor(Date.now() / 1000) + 3600 })}`,
      },
    };
    await middleware.use(req, { status: () => ({ json: () => undefined }) } as never, vi.fn());
    return req.user;
  }

  it("puts the organisation type on the request user", async () => {
    const user = await userFor({ userId: "u1", tenantId: "t1", portal: "tenant", active: true, permissions: [], organizationType: "owner_operator" });

    expect(user.organizationType).toBe("owner_operator");
  });

  it("leaves it null when auth reports none", async () => {
    const user = await userFor({ userId: "u1", tenantId: "t1", portal: "tenant", active: true, permissions: [] });

    expect(user.organizationType).toBeNull();
  });

  it("leaves it absent when auth could not be asked", async () => {
    const user = await userFor(undefined);

    expect(user.organizationType).toBeUndefined();
  });
});
