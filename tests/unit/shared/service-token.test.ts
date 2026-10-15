import { afterEach, describe, expect, it } from "vitest";
import { generateKeyPairSync, sign } from "node:crypto";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ACTING_FOR_TENANT_HEADER,
  SERVICE_TOKEN_HEADER,
  ServiceCaller,
  ServiceTokenVerifier,
} from "@shared/identity";

const ISSUER = "https://kubernetes.default.svc.cluster.local";
const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const other = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: "jwk" }), kid: "k1" };

const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
function clusterToken(claims: object, key = privateKey, kid = "k1"): string {
  const signing = `${b64({ alg: "RS256", kid })}.${b64(claims)}`;
  return `${signing}.${sign("RSA-SHA256", Buffer.from(signing), key).toString("base64url")}`;
}
const claimsFor = (caller: string, audience: string, extra: object = {}) => ({
  iss: ISSUER,
  sub: `system:serviceaccount:truckmoov:${caller}`,
  aud: [audience],
  exp: Math.floor(Date.now() / 1000) + 3600,
  ...extra,
});
const cluster = () => new ServiceTokenVerifier("fleet", "", async () => ({ issuer: ISSUER, namespace: "truckmoov", keys: [jwk] }));

afterEach(() => {
  delete process.env.KUBERNETES_SERVICE_HOST;
});

describe("service tokens from the cluster", () => {
  it("names the calling service", async () => {
    expect(await cluster().verify(clusterToken(claimsFor("dispatch", "fleet")))).toBe("dispatch");
  });

  // Bound to the service it was issued for: a token taken from a call to
  // notification cannot be replayed against fleet.
  it("refuses a token addressed to another service", async () => {
    expect(await cluster().verify(clusterToken(claimsFor("dispatch", "notification")))).toBeNull();
  });

  // Any namespace's default account can mint a token for audience "fleet".
  it("refuses a service account from another namespace with the same name", async () => {
    const claims = claimsFor("dispatch", "fleet", { sub: "system:serviceaccount:sandbox:dispatch" });
    expect(await cluster().verify(clusterToken(claims))).toBeNull();
  });

  it("refuses expired, foreign, mis-signed and malformed tokens", async () => {
    const verifier = cluster();
    const refused = [
      clusterToken(claimsFor("dispatch", "fleet", { exp: 1 })),
      clusterToken(claimsFor("dispatch", "fleet", { iss: "https://elsewhere" })),
      clusterToken(claimsFor("dispatch", "fleet"), other.privateKey),
      clusterToken(claimsFor("dispatch", "fleet"), privateKey, "k9"),
      clusterToken(claimsFor("dispatch", "fleet", { sub: "someone" })),
      "a.b.c",
    ];
    for (const token of refused) {
      expect(await verifier.verify(token)).toBeNull();
    }
  });
});

describe("service calls outside the cluster", () => {
  const config = (dir: string) => ({ self: "dispatch", tokenDir: dir, devSecret: "dev-secret", legacySecret: "" });

  it("signs with the dev secret and says whose behalf it acts on", async () => {
    const headers = new ServiceCaller(config(mkdtempSync(join(tmpdir(), "svc-")))).headers("fleet", { tenantId: "tenant-a" })!;

    expect(headers[ACTING_FOR_TENANT_HEADER]).toBe("tenant-a");
    expect(await new ServiceTokenVerifier("fleet", "dev-secret", null).verify(headers[SERVICE_TOKEN_HEADER])).toBe("dispatch");
  });

  it("never uses the dev secret inside the cluster", async () => {
    const devToken = new ServiceCaller(config(mkdtempSync(join(tmpdir(), "svc-")))).headers("fleet")![SERVICE_TOKEN_HEADER];
    process.env.KUBERNETES_SERVICE_HOST = "10.43.0.1";

    expect(new ServiceCaller(config(mkdtempSync(join(tmpdir(), "svc-")))).headers("fleet")).toBeNull();
    expect(await new ServiceTokenVerifier("fleet", "dev-secret", async () => ({ issuer: ISSUER, namespace: "truckmoov", keys: [] })).verify(devToken)).toBeNull();
  });

  it("presents the projected token when the cluster mounted one", () => {
    const dir = mkdtempSync(join(tmpdir(), "svc-"));
    mkdirSync(join(dir, "fleet"));
    writeFileSync(join(dir, "fleet", "token"), "projected\n");

    expect(new ServiceCaller(config(dir)).headers("fleet")?.[SERVICE_TOKEN_HEADER]).toBe("projected");
  });

  it("sends the older token only while the compatibility window is open", () => {
    const dir = mkdtempSync(join(tmpdir(), "svc-"));
    const open = new ServiceCaller({ ...config(dir), legacySecret: "shared" }).headers("fleet", { tenantId: "t", legacyRole: "FLEET_ADMIN" });
    const closed = new ServiceCaller(config(dir)).headers("fleet", { tenantId: "t", legacyRole: "FLEET_ADMIN" });

    expect(open?.authorization).toMatch(/^Bearer /);
    expect(closed?.authorization).toBeUndefined();
  });
});
