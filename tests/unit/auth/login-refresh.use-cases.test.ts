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
    expect(result.refreshToken).toBe("refresh-token");
    expect(result.user.email).toBe("dev-admin");

    const stored = await sessionStore.getByRefreshToken("refresh-token");
    expect(stored?.email).toBe("dev-admin");
  });

  it("refresh rejects unknown refresh token", async () => {
    const useCase = new RefreshUseCase(new FakeSessionStore(), new FakeTokenService());

    await expect(() => useCase.execute("unknown-refresh")).rejects.toBeInstanceOf(
      InvalidRefreshTokenError,
    );
  });
});
