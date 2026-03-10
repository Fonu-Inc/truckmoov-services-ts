import { describe, expect, it } from "vitest";
import { AuthUser } from "../../../apps/auth/src/contexts/auth/session/domain/entities/auth-user.entity";
import { InvalidRefreshTokenError } from "../../../apps/auth/src/contexts/auth/session/domain/errors/invalid-refresh-token.error";
import { LoginUseCase } from "../../../apps/auth/src/contexts/auth/session/application/use-cases/login.use-case";
import { RefreshUseCase } from "../../../apps/auth/src/contexts/auth/session/application/use-cases/refresh.use-case";

class FakeIdentityProvider {
  async verifyCredentials(username: string, _password: string) {
    return AuthUser.create({ id: "user-1", username, roles: ["admin"], tenantId: "tenant-1" });
  }
}

class FakeTokenService {
  issueAccessToken() {
    return "access-token";
  }

  issueRefreshToken() {
    return "refresh-token";
  }

  resolveAccessToken() {
    return null;
  }
}

class FakeSessionStore {
  private readonly data = new Map<string, AuthUser>();

  async save(refreshToken: string, user: AuthUser) {
    this.data.set(refreshToken, user);
  }

  async getByRefreshToken(refreshToken: string) {
    return this.data.get(refreshToken) ?? null;
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
      username: "dev-admin",
      password: "StrongPass123!",
    });

    expect(result.accessToken).toBe("access-token");
    expect(result.refreshToken).toBe("refresh-token");
    expect(result.user.username).toBe("dev-admin");

    const stored = await sessionStore.getByRefreshToken("refresh-token");
    expect(stored?.username).toBe("dev-admin");
  });

  it("refresh rejects unknown refresh token", async () => {
    const useCase = new RefreshUseCase(new FakeSessionStore(), new FakeTokenService());

    await expect(() => useCase.execute("unknown-refresh")).rejects.toBeInstanceOf(
      InvalidRefreshTokenError,
    );
  });
});
