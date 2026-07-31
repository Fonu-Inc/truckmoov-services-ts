import { describe, expect, it } from "vitest";
import { AuthUser } from "../../../apps/auth/src/contexts/auth/session/domain/entities/auth-user.entity";
import { InvalidRefreshTokenError } from "../../../apps/auth/src/contexts/auth/session/domain/errors/invalid-refresh-token.error";
import { LoginUseCase } from "../../../apps/auth/src/contexts/auth/session/application/use-cases/login.use-case";
import { RefreshUseCase } from "../../../apps/auth/src/contexts/auth/session/application/use-cases/refresh.use-case";

class FakeIdentityProvider {
  async verifyCredentials(email: string, _password: string) {
    return AuthUser.create({ id: "user-1", email, role: "admin", tenantId: "tenant-1" });
  }
}

class FakeTokenService {
  private refreshTokenCounter = 0;

  issueAccessToken() {
    return "access-token";
  }

  issueRefreshToken() {
    this.refreshTokenCounter += 1;
    return `refresh-token-${this.refreshTokenCounter}`;
  }

  resolveAccessToken() {
    return null;
  }
}

class FakeUserRepository {
  private readonly users = new Map<string, { id: string; accountStatus: "enabled" | "disabled" }>();

  seed(id: string, accountStatus: "enabled" | "disabled" = "enabled") {
    this.users.set(id, { id, accountStatus });
  }

  async findById(id: string) {
    return this.users.get(id) ?? null;
  }
}

class FakeSessionStore {
  private readonly data = new Map<string, {
    user: AuthUser;
    updatedAt: Date;
  }>();

  async save(refreshToken: string, user: AuthUser) {
    this.data.set(refreshToken, {
      user,
      updatedAt: new Date(),
    });
  }

  async getByRefreshToken(refreshToken: string) {
    return this.data.get(refreshToken)?.user ?? null;
  }

  async deleteByRefreshToken(refreshToken: string) {
    this.data.delete(refreshToken);
  }

  async deleteAllForUser(userId: string) {
    for (const [refreshToken, session] of this.data.entries()) {
      if (session.user.id === userId) {
        this.data.delete(refreshToken);
      }
    }
  }

  async listUserActivity(userIds: string[]) {
    return [...this.data.values()]
      .filter((session) => userIds.includes(session.user.id))
      .map((session) => ({
        userId: session.user.id,
        hasActiveSession: true,
        lastActiveAt: session.updatedAt,
      }));
  }
}

describe("Auth use-cases", () => {
  it("login stores refresh session and returns token response", async () => {
    const sessionStore = new FakeSessionStore();
    const useCase = new LoginUseCase(
      new FakeIdentityProvider(),
      new FakeTokenService(),
      sessionStore,
    );

    const result = await useCase.execute({
      email: "dev-admin",
      password: "StrongPass123!",
    });

    expect(result.accessToken).toBe("access-token");
    expect(result.refreshToken).toBe("refresh-token-1");
    expect(result.user.email).toBe("dev-admin");

    const stored = await sessionStore.getByRefreshToken("refresh-token-1");
    expect(stored?.email).toBe("dev-admin");
  });

  it("refresh rejects unknown refresh token", async () => {
    const useCase = new RefreshUseCase(
      new FakeSessionStore(),
      new FakeTokenService(),
      new FakeUserRepository() as never,
    );

    await expect(() => useCase.execute("unknown-refresh")).rejects.toBeInstanceOf(
      InvalidRefreshTokenError,
    );
  });

  it("refresh rotates the refresh token and invalidates the old one", async () => {
    const sessionStore = new FakeSessionStore();
    const tokenService = new FakeTokenService();
    const userRepo = new FakeUserRepository();
    userRepo.seed("user-1", "enabled");

    const loginUseCase = new LoginUseCase(new FakeIdentityProvider(), tokenService, sessionStore);
    const loginResult = await loginUseCase.execute({ email: "dev-admin", password: "StrongPass123!" });
    const oldRefreshToken = loginResult.refreshToken;

    const refreshUseCase = new RefreshUseCase(sessionStore, tokenService, userRepo as never);
    const refreshResult = await refreshUseCase.execute(oldRefreshToken);

    expect(refreshResult.refreshToken).not.toBe(oldRefreshToken);
    expect(refreshResult.accessToken).toBe("access-token");

    // Old token is now invalid — a replay attempt fails.
    await expect(() => refreshUseCase.execute(oldRefreshToken)).rejects.toBeInstanceOf(
      InvalidRefreshTokenError,
    );

    // New token works.
    const secondRefresh = await refreshUseCase.execute(refreshResult.refreshToken);
    expect(secondRefresh.refreshToken).not.toBe(refreshResult.refreshToken);
  });

  it("refresh rejects and clears the session for a disabled account", async () => {
    const sessionStore = new FakeSessionStore();
    const tokenService = new FakeTokenService();
    const userRepo = new FakeUserRepository();
    userRepo.seed("user-1", "disabled");

    const loginUseCase = new LoginUseCase(new FakeIdentityProvider(), tokenService, sessionStore);
    const loginResult = await loginUseCase.execute({ email: "dev-admin", password: "StrongPass123!" });

    const refreshUseCase = new RefreshUseCase(sessionStore, tokenService, userRepo as never);
    await expect(() => refreshUseCase.execute(loginResult.refreshToken)).rejects.toThrow(
      "This account has been disabled",
    );

    expect(await sessionStore.getByRefreshToken(loginResult.refreshToken)).toBeNull();
  });
});
