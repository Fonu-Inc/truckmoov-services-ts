import { describe, expect, it } from "vitest";
import { RefreshUseCase } from "../../../apps/auth/src/contexts/auth/session/application/use-cases/refresh.use-case";
import { AuthUser } from "../../../apps/auth/src/contexts/auth/session/domain/entities/auth-user.entity";
import { InvalidRefreshTokenError } from "../../../apps/auth/src/contexts/auth/session/domain/errors/invalid-refresh-token.error";
import { InMemorySessionStore } from "../../../apps/auth/src/contexts/auth/session/infrastructure/in-memory-session.store";

describe("concurrent refresh with one token", () => {
  it("lets one win and revokes the session for the other", async () => {
    const store = new InMemorySessionStore();
    const user = AuthUser.create({ id: "user-1", email: "a@example.com", role: "ENTERPRISE_ADMIN", tenantId: "tenant-a" });
    await store.save("old", user);
    let issued = 0;
    const useCase = new RefreshUseCase(
      store,
      { issueAccessToken: () => "access", issueRefreshToken: () => `new-${++issued}` } as never,
      { findById: async () => ({ ...user.toPrimitives(), accountStatus: "enabled", emailVerificationToken: null }) } as never,
      { idleTimeoutMinutes: async () => null },
    );

    const results = await Promise.allSettled([useCase.execute("old"), useCase.execute("old")]);

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(rejected.reason).toBeInstanceOf(InvalidRefreshTokenError);
    expect(await store.getByRefreshToken("new-1")).toBeNull();
  });
});
