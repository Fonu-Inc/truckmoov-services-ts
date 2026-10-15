import { describe, expect, it, vi } from "vitest";
import { Role } from "@shared/rbac";
import { InviteUserUseCase } from "../../../apps/auth/src/contexts/auth/session/application/use-cases/invite-user.use-case";
import { CreateSystemAdminUseCase } from "../../../apps/auth/src/contexts/auth/session/application/use-cases/create-system-admin.use-case";
import { EmailTakenError } from "../../../apps/auth/src/contexts/auth/session/domain/errors/email-taken.error";
import { InMemoryInviteRepository } from "../../../apps/auth/src/contexts/auth/session/infrastructure/in-memory-invite.repository";
import { InMemoryUserRepository } from "../../../apps/auth/src/contexts/auth/session/infrastructure/in-memory-user.repository";
import { SYSTEM_TENANT_ID } from "@shared/identity";

async function users() {
  const repo = new InMemoryUserRepository();
  await repo.save({
    id: "u-1", email: "taken@x.com", passwordHash: "h", role: Role.SUPER_ADMIN, tenantId: SYSTEM_TENANT_ID,
  } as never);
  return repo;
}

describe("email case", () => {
  it("finds a user whatever the case of the address", async () => {
    expect((await (await users()).findByEmail("Taken@X.com"))?.id).toBe("u-1");
  });

  it("stores an invite lowercased and refuses an existing account in another case", async () => {
    const inviteRepo = new InMemoryInviteRepository();
    const caller = { id: "u-caller", role: Role.ENTERPRISE_ADMIN, tenantId: "t1" };
    const uc = new InviteUserUseCase(
      inviteRepo,
      { resolveAccessToken: () => caller } as never,
      { sendTenantInviteEmail: vi.fn() } as never,
      { generate: () => `gen-${Math.random()}` } as never,
      await users(),
      { mayGrantRole: async () => true } as never,
    );

    await uc.execute({ email: " New@X.com ", role: Role.FLEET_ADMIN, accessToken: "tok" });
    expect((await inviteRepo.listPendingByTenant("t1"))[0].email).toBe("new@x.com");
    await expect(uc.execute({ email: "TAKEN@x.com", role: Role.FLEET_ADMIN, accessToken: "tok" })).rejects.toBeInstanceOf(EmailTakenError);
  });

  it("create system admin refuses an existing address in another case", async () => {
    const repo = await users();
    const uc = new CreateSystemAdminUseCase(
      repo,
      { resolveAccessToken: () => ({ id: "u-1" }) } as never,
      { hash: async () => "h" } as never,
      { generate: () => "new-id" } as never,
      { listUserActivity: async () => [] } as never,
    );

    await expect(
      uc.execute({ accessToken: "tok", fullName: "A", email: " TAKEN@x.com ", password: "p" }),
    ).rejects.toBeInstanceOf(EmailTakenError);
  });
});
