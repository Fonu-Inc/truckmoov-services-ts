import { describe, expect, it } from "vitest";
import { AuthUser } from "../../../apps/auth/src/contexts/auth/session/domain/entities/auth-user.entity";
import { InvalidRefreshTokenError } from "../../../apps/auth/src/contexts/auth/session/domain/errors/invalid-refresh-token.error";
import { LoginUseCase } from "../../../apps/auth/src/contexts/auth/session/application/use-cases/login.use-case";
import { RefreshUseCase } from "../../../apps/auth/src/contexts/auth/session/application/use-cases/refresh.use-case";
import { ForbiddenError } from "../../../apps/auth/src/contexts/auth/session/domain/errors/forbidden.error";

/** These tests are about refresh, not about the idle timeout. */
function noSessionTimeout() {
  return { idleTimeoutMinutes: async () => null };
}


class FakeIdentityProvider {
  constructor(
    private readonly role = "admin",
    private readonly tenantId = "tenant-1",
  ) {}

  async verifyCredentials(email: string, _password: string) {
    return AuthUser.create({ id: "user-1", email, role: this.role, tenantId: this.tenantId });
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

type SeededUser = { id: string; email: string; accountStatus: "enabled" | "disabled"; role: string; tenantId: string };

class FakeUserRepository {
  private readonly users = new Map<string, SeededUser>();

  seed(
    id: string,
    accountStatus: "enabled" | "disabled" = "enabled",
    role = "admin",
    tenantId = "tenant-1",
  ) {
    this.users.set(id, { id, email: `${id}@co.com`, accountStatus, role, tenantId });
  }

  async findById(id: string) {
    return this.users.get(id) ?? null;
  }

  changeRole(id: string, role: string) {
    const user = this.users.get(id);
    if (user) this.users.set(id, { ...user, role });
  }
}

class FakeSessionStore {
  private readonly spent = new Set<string>();
  private readonly families = new Map<string, string>();

  async rotate(oldToken: string, newToken: string, user: AuthUser) {
    const family = this.families.get(oldToken) ?? oldToken;
    this.spent.add(oldToken);
    await this.deleteByRefreshToken(oldToken);
    await this.save(newToken, user);
    this.families.set(newToken, family);
    this.families.set(oldToken, family);
  }

  async isSpent(token: string) {
    return this.spent.has(token);
  }

  async revokeFamily(token: string) {
    const family = this.families.get(token);
    for (const [t, f] of this.families) if (f === family) await this.deleteByRefreshToken(t);
  }

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
      noSessionTimeout(),
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

    const refreshUseCase = new RefreshUseCase(sessionStore, tokenService, userRepo as never, noSessionTimeout());
    const refreshResult = await refreshUseCase.execute(oldRefreshToken);

    expect(refreshResult.refreshToken).not.toBe(oldRefreshToken);
    expect(refreshResult.accessToken).toBe("access-token");

    // New token works.
    const secondRefresh = await refreshUseCase.execute(refreshResult.refreshToken);
    expect(secondRefresh.refreshToken).not.toBe(refreshResult.refreshToken);

    // Old token is now invalid — a replay attempt fails.
    await expect(() => refreshUseCase.execute(oldRefreshToken)).rejects.toBeInstanceOf(
      InvalidRefreshTokenError,
    );
  });

  it("refresh rejects and clears the session for a disabled account", async () => {
    const sessionStore = new FakeSessionStore();
    const tokenService = new FakeTokenService();
    const userRepo = new FakeUserRepository();
    userRepo.seed("user-1", "disabled");

    const loginUseCase = new LoginUseCase(new FakeIdentityProvider(), tokenService, sessionStore);
    const loginResult = await loginUseCase.execute({ email: "dev-admin", password: "StrongPass123!" });

    const refreshUseCase = new RefreshUseCase(sessionStore, tokenService, userRepo as never, noSessionTimeout());
    await expect(() => refreshUseCase.execute(loginResult.refreshToken)).rejects.toThrow(
      "This account has been disabled",
    );

    expect(await sessionStore.getByRefreshToken(loginResult.refreshToken)).toBeNull();
  });
});

describe("each login admits only its own people", () => {
  function login(role: string, tenantId: string) {
    return new LoginUseCase(new FakeIdentityProvider(role, tenantId), new FakeTokenService(), new FakeSessionStore());
  }
  const credentials = { email: "someone@co.com", password: "StrongPass123!" };

  it("tenant login refuses a platform admin held inside a tenant", async () => {
    await expect(login("PLATFORM_ADMIN", "tenant-1").execute(credentials)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("admin login refuses a platform admin held inside a tenant", async () => {
    await expect(
      login("PLATFORM_ADMIN", "tenant-1").executeForAudience(credentials, "system"),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("admin login admits a platform admin in the system tenant", async () => {
    const result = await login("PLATFORM_ADMIN", "system").executeForAudience(credentials, "system");

    expect(result.user.role).toBe("PLATFORM_ADMIN");
  });

  it("admin login refuses a tenant role", async () => {
    await expect(
      login("FLEET_ADMIN", "tenant-1").executeForAudience(credentials, "system"),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("refresh ends a session held by a platform admin inside a tenant", async () => {
    const sessionStore = new FakeSessionStore();
    const tokenService = new FakeTokenService();
    const userRepo = new FakeUserRepository();
    userRepo.seed("user-1", "enabled", "PLATFORM_ADMIN", "tenant-1");
    const misplaced = AuthUser.create({ id: "user-1", email: "x@co.com", role: "PLATFORM_ADMIN", tenantId: "tenant-1" });
    await sessionStore.save("old-session", misplaced);

    const refresh = new RefreshUseCase(sessionStore, tokenService, userRepo as never, noSessionTimeout());

    await expect(refresh.execute("old-session")).rejects.toBeInstanceOf(ForbiddenError);
    expect(await sessionStore.getByRefreshToken("old-session")).toBeNull();
  });

  it("refresh issues the account as it is now, not as it was at login", async () => {
    const sessionStore = new FakeSessionStore();
    const issued: string[] = [];
    const tokenService = new (class extends FakeTokenService {
      issueAccessToken(user?: AuthUser) {
        issued.push(user?.role ?? "");
        return "access-token";
      }
    })();
    const userRepo = new FakeUserRepository();
    userRepo.seed("user-1", "enabled", "DISPATCHER", "tenant-1");
    const login = new LoginUseCase(new FakeIdentityProvider("DISPATCHER", "tenant-1"), tokenService, sessionStore);
    const { refreshToken } = await login.execute({ email: "d@co.com", password: "StrongPass123!" });

    userRepo.changeRole("user-1", "OPERATIONS_MANAGER");
    const refresh = new RefreshUseCase(sessionStore, tokenService, userRepo as never, noSessionTimeout());
    const renewed = await refresh.execute(refreshToken);

    expect(issued.at(-1)).toBe("OPERATIONS_MANAGER");
    expect((await sessionStore.getByRefreshToken(renewed.refreshToken))?.role).toBe("OPERATIONS_MANAGER");
  });

  it("ends the whole session when a spent refresh token comes back", async () => {
    const sessionStore = new FakeSessionStore();
    const tokenService = new FakeTokenService();
    const userRepo = new FakeUserRepository();
    userRepo.seed("user-1");
    const login = new LoginUseCase(new FakeIdentityProvider(), tokenService, sessionStore);
    const first = (await login.execute({ email: "a@co.com", password: "StrongPass123!" })).refreshToken;
    const refresh = new RefreshUseCase(sessionStore, tokenService, userRepo as never, noSessionTimeout());
    const second = (await refresh.execute(first)).refreshToken;

    // Someone replays the first token after the holder moved on.
    await expect(refresh.execute(first)).rejects.toBeInstanceOf(InvalidRefreshTokenError);

    // The token the holder is using now is dead too.
    await expect(refresh.execute(second)).rejects.toBeInstanceOf(InvalidRefreshTokenError);
  });
});
