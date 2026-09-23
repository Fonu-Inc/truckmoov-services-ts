import {
  createHmac,
  createPrivateKey,
  createPublicKey,
  sign,
  timingSafeEqual,
  verify,
  type KeyObject,
} from "node:crypto";
import { portalFor, type Portal } from "./platform-actor";

/** The iss claim auth puts on every signed user token. */
export const USER_TOKEN_ISSUER = "truckmoov-auth";

export type UserTokenSubject = { id: string; email: string; role: string; tenantId: string };

export type UserTokenClaims = {
  sub: string;
  email: string;
  role: string;
  tenantId: string;
  portal: Portal;
  exp: number;
  /** Issued before tokens were signed with a private key; portal was inferred. */
  legacy: boolean;
};

type Payload = Omit<UserTokenClaims, "legacy"> & { iss?: string; iat?: number };

// DER prefixes that wrap a raw 32-byte Ed25519 key, so keys travel as short
// base64url strings rather than PEM blocks in environment variables.
const PKCS8_ED25519 = Buffer.from("302e020100300506032b657004220420", "hex");
const SPKI_ED25519 = Buffer.from("302a300506032b6570032100", "hex");

function parseKeyEntry(entry: string): [kid: string, raw: Buffer] {
  const [kid, encoded] = entry.trim().split(":");
  const raw = Buffer.from(encoded ?? "", "base64url");
  if (!kid || raw.length !== 32) {
    throw new Error(`user token key "${kid}" is not kid:base64url of 32 bytes`);
  }
  return [kid, raw];
}

function encode(value: object): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function decode<T>(segment: string): T | null {
  try {
    return JSON.parse(Buffer.from(segment, "base64url").toString("utf8")) as T;
  } catch {
    return null;
  }
}

function hmac(secret: string, value: string): string {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

function sameString(left: string, right: string): boolean {
  const a = Buffer.from(left, "utf8");
  const b = Buffer.from(right, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Issues user tokens. Only auth constructs one: every other service gets the
 * public key and can check a token but never make one.
 */
export class UserTokenSigner {
  private readonly key: { kid: string; privateKey: KeyObject } | null;

  /**
   * @param signingKey "kid:base64url" of the 32-byte Ed25519 seed. Empty
   *   falls back to the older shared-secret tokens, for local runs only.
   */
  constructor(signingKey: string, private readonly legacySecret: string) {
    if (!signingKey.trim()) {
      this.key = null;
      return;
    }
    const [kid, seed] = parseKeyEntry(signingKey);
    const privateKey = createPrivateKey({ key: Buffer.concat([PKCS8_ED25519, seed]), format: "der", type: "pkcs8" });
    this.key = { kid, privateKey };
  }

  get signsWithPrivateKey(): boolean {
    return this.key !== null;
  }

  sign(user: UserTokenSubject, ttlSeconds: number, now = Date.now()): string {
    const iat = Math.floor(now / 1000);
    const claims = {
      sub: user.id,
      email: user.email,
      role: user.role,
      tenantId: user.tenantId,
      exp: iat + ttlSeconds,
    };
    if (!this.key) {
      const payload = encode(claims);
      return `${payload}.${hmac(this.legacySecret, payload)}`;
    }
    const header = encode({ alg: "EdDSA", typ: "JWT", kid: this.key.kid });
    const payload = encode({ iss: USER_TOKEN_ISSUER, ...claims, portal: portalFor(user), iat });
    const signature = sign(null, Buffer.from(`${header}.${payload}`), this.key.privateKey);
    return `${header}.${payload}.${signature.toString("base64url")}`;
  }
}

/** Checks user tokens against auth's public keys. */
export class UserTokenVerifier {
  private readonly keys = new Map<string, KeyObject>();

  /**
   * @param publicKeys "kid:base64url,..." so a new key can be published next
   *   to the old one while tokens signed with the old one expire.
   * @param legacySecret non-empty also accepts the older shared-secret
   *   tokens: the compatibility window while tokens issued before the switch
   *   run out.
   */
  constructor(publicKeys: string, private readonly legacySecret = "") {
    for (const entry of publicKeys.split(",").filter((e) => e.trim())) {
      const [kid, raw] = parseKeyEntry(entry);
      this.keys.set(kid, createPublicKey({ key: Buffer.concat([SPKI_ED25519, raw]), format: "der", type: "spki" }));
    }
  }

  verify(token: string | undefined, now = Date.now()): UserTokenClaims | null {
    const parts = (token ?? "").trim().split(".");
    if (parts.length === 3) return this.verifySigned(parts, now);
    if (parts.length === 2) return this.verifyLegacy(parts, now);
    return null;
  }

  private verifySigned([header, payload, signature]: string[], now: number): UserTokenClaims | null {
    const parsed = decode<{ alg?: string; kid?: string }>(header);
    const key = parsed?.alg === "EdDSA" ? this.keys.get(parsed.kid ?? "") : undefined;
    if (!key) return null;
    if (!verify(null, Buffer.from(`${header}.${payload}`), key, Buffer.from(signature, "base64url"))) return null;
    const claims = decode<Payload>(payload);
    if (claims?.iss !== USER_TOKEN_ISSUER) return null;
    if (claims.portal !== "admin" && claims.portal !== "tenant") return null;
    return this.complete(claims, false, now);
  }

  private verifyLegacy([payload, signature]: string[], now: number): UserTokenClaims | null {
    if (!this.legacySecret) return null;
    if (!sameString(signature, hmac(this.legacySecret, payload))) return null;
    const claims = decode<Payload>(payload);
    if (!claims) return null;
    return this.complete({ ...claims, portal: portalFor(claims) }, true, now);
  }

  private complete(claims: Payload, legacy: boolean, now: number): UserTokenClaims | null {
    const fields = [claims.sub, claims.email, claims.role, claims.tenantId];
    if (fields.some((field) => typeof field !== "string" || !field)) return null;
    if (typeof claims.exp !== "number" || claims.exp <= Math.floor(now / 1000)) return null;
    return {
      sub: claims.sub,
      email: claims.email,
      role: claims.role,
      tenantId: claims.tenantId,
      portal: claims.portal,
      exp: claims.exp,
      legacy,
    };
  }
}
