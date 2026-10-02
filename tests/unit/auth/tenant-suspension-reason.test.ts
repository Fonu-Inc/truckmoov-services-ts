import "reflect-metadata";
import { describe, expect, it, vi } from "vitest";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { UpdateSystemTenantStatusDto } from "../../../apps/auth/src/dto/update-system-tenant-status.dto";
import { UpdateSystemTenantStatusUseCase } from "../../../apps/auth/src/update-system-tenant-status.use-case";
import { ListSystemTenantsUseCase } from "../../../apps/auth/src/list-system-tenants.use-case";
import { InMemoryTenantSuspensionRepository } from "../../../apps/auth/src/mikro-tenant-suspension.repository";
import { InMemorySimRepository } from "../../../apps/auth/src/in-memory-sim.repository";
import { InMemoryTenantAssetStore } from "../../../apps/auth/src/tenant-asset-store";
import { TenantSuspensionService } from "../../../apps/auth/src/tenant-suspension.service";
import { InMemoryTenantTerminationRepository } from "../../../apps/auth/src/mikro-tenant-termination.repository";

const REASON = "Invoice 30 days overdue";

const actor = {
  id: "sys1",
  email: "admin@system",
  passwordHash: "x",
  role: "SYSTEM_ADMIN",
  tenantId: "system",
  accountStatus: "enabled",
  profile: { fullName: "Ada Staff" },
};

function build() {
  const users: Array<Record<string, unknown>> = [
    { id: "u1", email: "a@t1.test", role: "FLEET_ADMIN", tenantId: "t1", accountStatus: "enabled" },
    { id: "u2", email: "b@t1.test", role: "DISPATCHER", tenantId: "t1", accountStatus: "enabled" },
  ];
  const userRepository = {
    findById: async (id: string) => (id === actor.id ? actor : (users.find((u) => u.id === id) ?? null)),
    findAll: async () => [actor, ...users],
    findAllByTenant: async (tenantId: string) => users.filter((u) => u.tenantId === tenantId),
    updateAccountStatus: async (id: string, status: string) => {
      const user = users.find((u) => u.id === id);
      if (user) user.accountStatus = status;
    },
  };
  const tokenService = { resolveAccessToken: () => ({ id: actor.id }) };
  const sessionStore = { deleteAllForUser: vi.fn(async () => {}), listUserActivity: async () => [] };
  const suspensions = new InMemoryTenantSuspensionRepository();
  const list = new ListSystemTenantsUseCase(
    { persistence: { backend: "in-memory" } } as never,
    tokenService as never,
    userRepository as never,
    sessionStore as never,
    { findAll: async () => [], findByTenantId: async () => null } as never,
    { findByTenantId: async () => null } as never,
    { findAll: async () => [] } as never,
    new InMemoryTenantTerminationRepository(),
    { findAll: async () => [] } as never,
    suspensions,
    { currentPlanCodes: async () => new Map() } as never,
    { list: async () => ({ items: [], total: 0 }) } as never,
    { collectedKoboByTenant: async () => new Map() } as never,
  );
  const get = { execute: (token: string, id: string) => list.list(token, {}).then((rows) => ({ data: { tenant: rows.find((r) => r.id === id) } })) };
  const sims = new InMemorySimRepository();
  const cascade = new TenantSuspensionService(
    {} as never,
    suspensions,
    userRepository as never,
    sims,
    sessionStore as never,
    { changed: () => {} } as never,
    {
      suspendTenantAssets: async () => ({ ok: true, devices: 0, vehicles: 0, shareLinks: 0 }),
      reinstateTenantAssets: async () => ({ ok: true, devices: 0, vehicles: 0, shareLinks: 0 }),
    } as never,
    { publish: async () => {} } as never,
    { publish: async () => {} },
    new InMemoryTenantAssetStore(userRepository as never, sims),
  );
  const useCase = new UpdateSystemTenantStatusUseCase(
    tokenService as never,
    userRepository as never,
    { findByTenantId: async () => null } as never,
    get as never,
    cascade,
  );
  return { useCase, list, suspensions, sessionStore, users };
}

async function dtoErrors(body: Record<string, unknown>) {
  return validate(plainToInstance(UpdateSystemTenantStatusDto, body));
}

describe("Tenant suspension reason", () => {
  it("rejects a suspension without a reason", async () => {
    expect(await dtoErrors({ status: "suspended" })).not.toHaveLength(0);
  });

  it("rejects a reason shorter than five characters after trimming", async () => {
    expect(await dtoErrors({ status: "suspended", reason: "  ab  " })).not.toHaveLength(0);
  });

  it("rejects a reason over 500 characters", async () => {
    expect(await dtoErrors({ status: "suspended", reason: "x".repeat(501) })).not.toHaveLength(0);
  });

  it("accepts a reinstatement without a reason", async () => {
    expect(await dtoErrors({ status: "active" })).toHaveLength(0);
  });

  it("accepts a suspension with a reason", async () => {
    expect(await dtoErrors({ status: "suspended", reason: REASON })).toHaveLength(0);
  });

  it("refuses a suspension with no reason at the use case too", async () => {
    const { useCase } = build();
    await expect(useCase.execute({ accessToken: "t", tenantId: "t1", status: "suspended" })).rejects.toThrow(/reason/i);
  });

  it("stores the reason, time and actor and shows them in the list", async () => {
    const { useCase, list } = build();
    await useCase.execute({ accessToken: "t", tenantId: "t1", status: "suspended", reason: ` ${REASON} ` });

    const [tenant] = await list.list("t", {});
    expect(tenant.status).toBe("suspended");
    expect(tenant.suspensionReason).toBe(REASON);
    expect(tenant.suspendedByName).toBe("Ada Staff");
    expect(new Date(tenant.suspendedAt as string).getTime()).toBeGreaterThan(Date.now() - 5000);
  });

  it("clears the record on reinstatement", async () => {
    const { useCase, list, suspensions } = build();
    await useCase.execute({ accessToken: "t", tenantId: "t1", status: "suspended", reason: REASON });
    await useCase.execute({ accessToken: "t", tenantId: "t1", status: "active" });

    const [tenant] = await list.list("t", {});
    expect(tenant.status).toBe("active");
    expect(tenant.suspendedAt).toBeNull();
    expect(tenant.suspendedByName).toBeNull();
    expect(tenant.suspensionReason).toBeNull();
    expect(await suspensions.findAll()).toHaveLength(0);
  });
});

describe("Tenant status guards", () => {
  it("refuses to change the platform tenant", async () => {
    const { useCase } = build();
    await expect(
      useCase.execute({ accessToken: "t", tenantId: "system", status: "suspended", reason: REASON }),
    ).rejects.toThrow(/not found/i);
  });

  it("keeps original time and actor when suspended again, updating the reason", async () => {
    const { useCase, suspensions } = build();
    await useCase.execute({ accessToken: "t", tenantId: "t1", status: "suspended", reason: REASON });
    const [first] = await suspensions.findAll();
    await new Promise((r) => setTimeout(r, 5));
    await useCase.execute({ accessToken: "t", tenantId: "t1", status: "suspended", reason: "New reason here" });
    const [second] = await suspensions.findAll();
    expect(second.suspendedAt).toEqual(first.suspendedAt);
    expect(second.suspendedBy).toBe(first.suspendedBy);
    expect(second.reason).toBe("New reason here");
  });
});

describe("Tenant status audit", () => {
  it("writes the reason into the audit metadata", async () => {
    const { SystemTenantsController } = await import("../../../apps/auth/src/system-tenants.controller");
    const record = vi.fn(async () => {});
    const self = {
      extractBearerToken: () => "tok",
      updateSystemTenantStatusUseCase: { execute: async () => ({ data: { tenant: { status: "suspended" } } }) },
      tryRecordActivityFromAccessToken: record,
    };

    await SystemTenantsController.prototype.updateSystemTenantStatus.call(
      self,
      "t1",
      { status: "suspended", reason: REASON },
      "Bearer tok",
    );

    expect(record).toHaveBeenCalledWith(
      "tok",
      expect.objectContaining({
        action: "system.tenant.suspended",
        metadata: expect.objectContaining({ reason: REASON }),
      }),
    );
  });
});
