import { describe, expect, it, vi } from "vitest";
import { Role } from "@shared/rbac";
import { InviteUserUseCase } from "../../../apps/auth/src/contexts/auth/session/application/use-cases/invite-user.use-case";
import { InMemoryInviteRepository } from "../../../apps/auth/src/contexts/auth/session/infrastructure/in-memory-invite.repository";

function build() {
  const inviteRepo = new InMemoryInviteRepository();
  const caller = { id: "u-caller", role: Role.ENTERPRISE_ADMIN, tenantId: "t1" };
  const tokenService = { resolveAccessToken: vi.fn().mockReturnValue(caller) };
  const notifier = { sendTenantInviteEmail: vi.fn().mockResolvedValue(undefined) };
  let seq = 0;
  const idGenerator = { generate: vi.fn(() => `gen-${++seq}`) };
  const uc = new InviteUserUseCase(
    inviteRepo,
    tokenService as any,
    notifier as any,
    idGenerator as any,
    // no existing account for the invited address
    { findByEmail: async () => null } as any,
    { mayGrantRole: async () => true } as any,
  );
  return { uc, inviteRepo, notifier, caller };
}

describe("InviteUserUseCase", () => {
  it("refuses to invite an enterprise admin", async () => {
    const { uc, inviteRepo } = build();

    await expect(
      uc.execute({ email: "a@x.com", role: Role.ENTERPRISE_ADMIN, accessToken: "tok" }),
    ).rejects.toThrow("Cannot invite users with this role");
    expect(await inviteRepo.listPendingByTenant("t1")).toHaveLength(0);
  });

  it("re-inviting the same email refreshes one pending invite instead of duplicating", async () => {
    const { uc, inviteRepo } = build();

    await uc.execute({ email: "a@x.com", role: Role.FLEET_ADMIN, accessToken: "tok" });
    await uc.execute({ email: "a@x.com", role: Role.FLEET_ADMIN, accessToken: "tok" });
    await uc.execute({ email: "a@x.com", role: Role.FLEET_ADMIN, accessToken: "tok" });

    const pending = await inviteRepo.listPendingByTenant("t1");
    expect(pending).toHaveLength(1);
  });

  it("keeps the invite id stable but rotates the token on re-invite", async () => {
    const { uc, inviteRepo } = build();

    await uc.execute({ email: "a@x.com", role: Role.FLEET_ADMIN, accessToken: "tok" });
    const first = (await inviteRepo.listPendingByTenant("t1"))[0];

    await uc.execute({ email: "a@x.com", role: Role.FLEET_ADMIN, accessToken: "tok" });
    const second = (await inviteRepo.listPendingByTenant("t1"))[0];

    expect(second.id).toBe(first.id);
    expect(second.token).not.toBe(first.token);
  });

  it("trims the email and dedupes across surrounding whitespace", async () => {
    const { uc, inviteRepo } = build();

    await uc.execute({ email: "a@x.com", role: Role.FLEET_ADMIN, accessToken: "tok" });
    await uc.execute({ email: "  a@x.com  ", role: Role.FLEET_ADMIN, accessToken: "tok" });

    const pending = await inviteRepo.listPendingByTenant("t1");
    expect(pending).toHaveLength(1);
    expect(pending[0].email).toBe("a@x.com");
  });

  it("keeps distinct pending invites for different emails", async () => {
    const { uc, inviteRepo } = build();

    await uc.execute({ email: "a@x.com", role: Role.FLEET_ADMIN, accessToken: "tok" });
    await uc.execute({ email: "b@x.com", role: Role.FLEET_ADMIN, accessToken: "tok" });

    const pending = await inviteRepo.listPendingByTenant("t1");
    expect(pending).toHaveLength(2);
  });

  it("adopts the latest role when re-inviting", async () => {
    const { uc, inviteRepo } = build();

    await uc.execute({ email: "a@x.com", role: Role.FLEET_ADMIN, accessToken: "tok" });
    await uc.execute({ email: "a@x.com", role: Role.DISPATCHER, accessToken: "tok" });

    const pending = await inviteRepo.listPendingByTenant("t1");
    expect(pending).toHaveLength(1);
    expect(pending[0].role).toBe(Role.DISPATCHER);
  });
});
