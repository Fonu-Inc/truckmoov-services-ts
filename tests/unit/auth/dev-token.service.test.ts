import { describe, expect, it, vi } from "vitest";
import { AppConfigService } from "../../../libs/shared/config/src/app-config.service";
import { AuthUser } from "../../../apps/auth/src/contexts/auth/session/domain/entities/auth-user.entity";
import { DevTokenService } from "../../../apps/auth/src/contexts/auth/session/infrastructure/dev-token.service";

function makeConfig(jwtSecret = "test-secret"): AppConfigService {
  return {
    auth: {
      jwtSecret,
    },
  } as AppConfigService;
}

describe("DevTokenService", () => {
  it("allows one instance to resolve tokens issued by another instance with the same secret", () => {
    const issuer = new DevTokenService(makeConfig());
    const verifier = new DevTokenService(makeConfig());
    const user = AuthUser.create({
      id: "user-1",
      email: "user@example.com",
      role: "ENTERPRISE_ADMIN",
      tenantId: "tenant-1",
    });

    const token = issuer.issueAccessToken(user);
    const resolved = verifier.resolveAccessToken(token);

    expect(resolved?.toPrimitives()).toEqual(user.toPrimitives());
  });

  it("rejects expired tokens", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-16T00:00:00.000Z"));

    const service = new DevTokenService(makeConfig());
    const token = service.issueAccessToken(
      AuthUser.create({
        id: "user-1",
        email: "user@example.com",
        role: "ENTERPRISE_ADMIN",
        tenantId: "tenant-1",
      }),
    );

    vi.setSystemTime(new Date("2026-03-16T01:00:01.000Z"));

    expect(service.resolveAccessToken(token)).toBeNull();

    vi.useRealTimers();
  });
});
