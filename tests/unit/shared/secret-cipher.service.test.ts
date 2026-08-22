import { describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import {
  SecretCipherNotConfiguredError,
  SecretCipherService,
  previewOf,
} from "@shared/crypto";

function cipherWithKey() {
  const key = randomBytes(32);
  return new SecretCipherService({ security: { secretEncryptionKey: key } } as never);
}

function cipherWithoutKey() {
  return new SecretCipherService({ security: { secretEncryptionKey: null } } as never);
}

describe("SecretCipherService", () => {
  it("recovers what it encrypted", () => {
    const cipher = cipherWithKey();
    const stored = cipher.encrypt("sk_live_abcdef123456");

    expect(cipher.decrypt(stored.ciphertext)).toBe("sk_live_abcdef123456");
  });

  it("never stores the plaintext in the ciphertext", () => {
    const stored = cipherWithKey().encrypt("sk_live_abcdef123456");

    expect(stored.ciphertext).not.toContain("sk_live_abcdef123456");
  });

  it("produces a different ciphertext each time, so equal secrets are not detectable", () => {
    const cipher = cipherWithKey();

    const first = cipher.encrypt("same-secret");
    const second = cipher.encrypt("same-secret");

    expect(first.ciphertext).not.toBe(second.ciphertext);
    expect(cipher.decrypt(first.ciphertext)).toBe(cipher.decrypt(second.ciphertext));
  });

  it("refuses a ciphertext that was tampered with", () => {
    const cipher = cipherWithKey();
    const stored = cipher.encrypt("sk_live_abcdef123456");

    const [iv, tag, body] = stored.ciphertext.split(":");
    const flipped = Buffer.from(body, "base64");
    flipped[0] ^= 0xff;
    const tampered = [iv, tag, flipped.toString("base64")].join(":");

    expect(() => cipher.decrypt(tampered)).toThrow();
  });

  it("refuses a ciphertext encrypted under another key", () => {
    const stored = cipherWithKey().encrypt("sk_live_abcdef123456");

    expect(() => cipherWithKey().decrypt(stored.ciphertext)).toThrow();
  });

  it("rejects a malformed ciphertext rather than returning nonsense", () => {
    expect(() => cipherWithKey().decrypt("not-a-real-ciphertext")).toThrow(/Malformed/);
  });

  it("reports a missing key instead of encrypting with a default", () => {
    expect(() => cipherWithoutKey().encrypt("secret")).toThrow(SecretCipherNotConfiguredError);
  });
});

describe("previewOf", () => {
  it("shows only the last four characters", () => {
    expect(previewOf("sk_live_abcdef123456")).toBe("••••••••3456");
  });

  it("reveals nothing at all for a short secret", () => {
    expect(previewOf("abc")).toBe("••••••••");
  });

  it("keeps enough of the secret hidden to be unusable", () => {
    const secret = "sk_live_abcdef123456";

    expect(previewOf(secret)).not.toContain("sk_live");
    expect(previewOf(secret).replace(/•/g, "").length).toBe(4);
  });
});
