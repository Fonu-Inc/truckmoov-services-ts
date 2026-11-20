import { describe, expect, it } from "vitest";
import { generateKeyPairSync } from "node:crypto";
import { readFileSync } from "node:fs";
import { UserTokenSigner, UserTokenVerifier } from "@shared/identity";

// The Go services verify the same file in pkg/identity/testdata. A change
// here that the Go side does not match is a token one language accepts and
// the other refuses.
const fixture = JSON.parse(readFileSync(`${__dirname}/../../fixtures/user-tokens.json`, "utf8")) as {
  publicKeys: string;
  legacySecret: string;
  cases: Array<{ name: string; token: string; expect: Record<string, unknown> | null; legacy?: boolean }>;
};

describe("user tokens, shared fixtures", () => {
  const verifier = new UserTokenVerifier(fixture.publicKeys, fixture.legacySecret);
  const strict = new UserTokenVerifier(fixture.publicKeys);

  for (const c of fixture.cases) {
    it(c.name, () => {
      const claims = verifier.verify(c.token);
      if (c.expect === null) {
        expect(claims).toBeNull();
        return;
      }
      expect(claims).toMatchObject(c.expect);
    });
  }

  it("refuses the older tokens once the compatibility window closes", () => {
    for (const c of fixture.cases.filter((x) => x.legacy)) {
      expect(strict.verify(c.token)).toBeNull();
    }
  });
});

describe("issuing user tokens", () => {
  const seed = Buffer.alloc(32, 7).toString("base64url");
  const user = { id: "u1", email: "a@b.com", role: "OWNER_OPERATOR", tenantId: "tenant-a" };

  it("stamps the portal the user belongs to", () => {
    const signer = new UserTokenSigner(`k:${seed}`, "");
    const token = signer.sign(user, 60);
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());

    expect(payload.portal).toBe("tenant");
    expect(token.split(".")).toHaveLength(3);
  });

  it("stamps and accepts the installer portal on an installer in the system tenant", () => {
    const pair = generateKeyPairSync("ed25519");
    const raw = (der: Buffer) => der.subarray(der.length - 32).toString("base64url");
    const privateSeed = raw(pair.privateKey.export({ format: "der", type: "pkcs8" }));
    const publicKey = raw(pair.publicKey.export({ format: "der", type: "spki" }));
    const token = new UserTokenSigner(`k:${privateSeed}`, "").sign({ ...user, role: "INSTALLER", tenantId: "system" }, 60);

    expect(new UserTokenVerifier(`k:${publicKey}`).verify(token)).toMatchObject({ portal: "installer", legacy: false });
  });

  it("falls back to a shared-secret token when no key is configured", () => {
    const token = new UserTokenSigner("", "local-secret").sign(user, 60);

    expect(new UserTokenVerifier("", "local-secret").verify(token)).toMatchObject({ portal: "tenant", legacy: true });
  });
});
