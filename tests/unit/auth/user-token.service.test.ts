import { describe, expect, it, vi } from "vitest";
import { createPrivateKey, createPublicKey } from "node:crypto";
import { AppConfigService } from "@shared/config";
import { AuthUser } from "../../../apps/auth/src/contexts/auth/session/domain/entities/auth-user.entity";
import { UserTokenService } from "../../../apps/auth/src/contexts/auth/session/infrastructure/user-token.service";

const SIGNING_SEED = Buffer.alloc(32, 3);

function makeConfig(jwtSecret = "test-secret", signed = false): AppConfigService {
  return {
    auth: { jwtSecret },
    identity: {
      signingKey: signed ? `k1:${SIGNING_SEED.toString("base64url")}` : "",
      publicKeys: signed ? `k1:${publicKeyOf(SIGNING_SEED)}` : "",
      legacySecret: jwtSecret,
    },
  } as AppConfigService;
}

function publicKeyOf(seed: Buffer): string {
  const key = createPrivateKey({
    key: Buffer.concat([Buffer.from("302e020100300506032b657004220420", "hex"), seed]),
    format: "der",
    type: "pkcs8",
  });
  return createPublicKey(key).export({ format: "der", type: "spki" }).subarray(-32).toString("base64url");
}

describe("UserTokenService", () => {
  it("allows one instance to resolve tokens issued by another instance with the same secret", () => {
    const issuer = new UserTokenService(makeConfig());
    const verifier = new UserTokenService(makeConfig());
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

    const service = new UserTokenService(makeConfig());
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

  it("signs with the private key when one is configured", () => {
    const service = new UserTokenService(makeConfig("test-secret", true));
    const user = AuthUser.create({ id: "u1", email: "a@b.com", role: "OWNER_OPERATOR", tenantId: "t1" });

    const token = service.issueAccessToken(user);

    expect(token.split(".")).toHaveLength(3);
    expect(service.resolveAccessToken(token)?.toPrimitives()).toEqual(user.toPrimitives());
  });

  it("no longer accepts a token forged with the shared secret once signing is on", () => {
    const signed = new UserTokenService({ ...makeConfig("test-secret", true), identity: { ...makeConfig("test-secret", true).identity, legacySecret: "" } } as AppConfigService);
    const forged = new UserTokenService(makeConfig("test-secret")).issueAccessToken(
      AuthUser.create({ id: "x", email: "x@y.com", role: "SUPER_ADMIN", tenantId: "system" }),
    );

    expect(signed.resolveAccessToken(forged)).toBeNull();
  });
});
