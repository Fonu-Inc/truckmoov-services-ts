import { afterEach, describe, expect, it, vi } from "vitest";
import { RefreshUseCase, REUSE_GRACE_MS } from "../../../apps/auth/src/contexts/auth/session/application/use-cases/refresh.use-case";
import { AuthUser } from "../../../apps/auth/src/contexts/auth/session/domain/entities/auth-user.entity";
import { InvalidRefreshTokenError } from "../../../apps/auth/src/contexts/auth/session/domain/errors/invalid-refresh-token.error";
import { InMemorySessionStore } from "../../../apps/auth/src/contexts/auth/session/infrastructure/in-memory-session.store";

async function setup() {
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
  return { store, useCase };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("refresh token reuse grace window", () => {
  it("lets concurrent refreshes with one token all continue the session", async () => {
    const { store, useCase } = await setup();

    const results = await Promise.all([useCase.execute("old"), useCase.execute("old")]);

    expect(results.map((r) => r.refreshToken).sort()).toEqual(["new-1", "new-2"]);
    expect(await store.getByRefreshToken("new-1")).not.toBeNull();
    expect(await store.getByRefreshToken("new-2")).not.toBeNull();
  });

  it("issues a fresh pair for a spent token presented within the window", async () => {
    const { store, useCase } = await setup();
    await useCase.execute("old");
    vi.spyOn(Date, "now").mockReturnValue(Date.now() + REUSE_GRACE_MS - 1_000);

    const again = await useCase.execute("old");

    expect(again.refreshToken).toBe("new-2");
    expect(await store.getByRefreshToken("new-1")).not.toBeNull();
    expect(await store.getByRefreshToken("new-2")).not.toBeNull();
  });

  it("revokes the whole session for a spent token presented after the window", async () => {
    const { store, useCase } = await setup();
    await useCase.execute("old");
    vi.spyOn(Date, "now").mockReturnValue(Date.now() + REUSE_GRACE_MS + 1_000);

    const error = await useCase.execute("old").catch((e: unknown) => e);

    expect(error).toBeInstanceOf(InvalidRefreshTokenError);
    expect((error as InvalidRefreshTokenError).code).toBe("refresh_reused");
    expect(await store.getByRefreshToken("new-1")).toBeNull();
  });

  it("answers an unknown token as invalid_refresh without touching anything", async () => {
    const { store, useCase } = await setup();

    const error = await useCase.execute("never-issued").catch((e: unknown) => e);

    expect((error as InvalidRefreshTokenError).code).toBe("invalid_refresh");
    expect(await store.getByRefreshToken("old")).not.toBeNull();
  });
});
