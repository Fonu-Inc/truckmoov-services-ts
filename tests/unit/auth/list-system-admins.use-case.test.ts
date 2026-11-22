import { describe, expect, it } from "vitest";
import { Role } from "@shared/rbac";
import { ListSystemAdminsUseCase } from "../../../apps/auth/src/contexts/auth/session/application/use-cases/list-system-admins.use-case";
import { InMemoryUserRepository } from "../../../apps/auth/src/contexts/auth/session/infrastructure/in-memory-user.repository";
import { InMemorySessionStore } from "../../../apps/auth/src/contexts/auth/session/infrastructure/in-memory-session.store";

const account = (id: string, role: Role, tenantId = "system") => ({
  id, email: `${id}@truckmoov.com`, passwordHash: "x", role, tenantId,
});

describe("ListSystemAdminsUseCase", () => {
  it("lists the seeded super admin beside the platform admins, and no tenant staff", async () => {
    const users = new InMemoryUserRepository();
    for (const user of [
      account("root", Role.SUPER_ADMIN),
      account("ops", Role.SYSTEM_ADMIN),
      account("fleet", Role.OWNER_OPERATOR, "tenant-a"),
    ]) await users.save(user);
    const tokens = { resolveAccessToken: () => ({ id: "root" }) };
    const useCase = new ListSystemAdminsUseCase(tokens as never, users, new InMemorySessionStore());

    const { users: listed } = await useCase.execute("token");

    expect(listed.map((user) => [user.userId, user.role]).sort()).toEqual([
      ["ops", Role.SYSTEM_ADMIN],
      ["root", Role.SUPER_ADMIN],
    ]);
  });

  it("lists every staff role with its custom role, and leaves installers out", async () => {
    const users = new InMemoryUserRepository();
    for (const user of [
      account("root", Role.SUPER_ADMIN),
      account("support", Role.PLATFORM_ADMIN),
      account("gov", Role.GOVERNANCE_OFFICER),
      account("fitter", Role.INSTALLER),
    ]) await users.save(user);
    await users.updateCustomRole("support", "role-1");
    const tokens = { resolveAccessToken: () => ({ id: "root" }) };
    const useCase = new ListSystemAdminsUseCase(tokens as never, users, new InMemorySessionStore());

    const { users: listed } = await useCase.execute("token");

    expect(listed.map((user) => [user.userId, user.customRoleId]).sort()).toEqual([
      ["gov", null],
      ["root", null],
      ["support", "role-1"],
    ]);
  });
});
