import { createHmac, createPublicKey, timingSafeEqual, verify, type JsonWebKey, type KeyObject } from "node:crypto";
import { readFileSync } from "node:fs";
import { request } from "node:https";
import { join } from "node:path";
import { SYSTEM_TENANT_ID } from "./platform-actor";

/** Headers a service call carries. The receiver decides what the caller may do. */
export const SERVICE_TOKEN_HEADER = "x-service-token";
export const ACTING_FOR_TENANT_HEADER = "x-acting-for-tenant";
export const ACTING_FOR_USER_HEADER = "x-acting-for-user";

const SERVICE_ACCOUNT_PREFIX = "system:serviceaccount:";
const DEV_ISSUER = "truckmoov-dev";
const DEV_TOKEN_SECONDS = 300;
const CLUSTER_API = "https://kubernetes.default.svc";
const SERVICE_ACCOUNT_DIR = "/var/run/secrets/kubernetes.io/serviceaccount";

export type ActingFor = {
  tenantId?: string;
  userId?: string;
  /** The role the call used to impersonate; sent only while receivers still accept the older tokens. */
  legacyRole?: string;
};

export type ServiceIdentityConfig = {
  /** The name other services know this one by. */
  self: string;
  tokenDir: string;
  /** Stands in for cluster tokens outside the cluster only. */
  devSecret: string;
  /** Non-empty while the compatibility window is open. */
  legacySecret: string;
};

function inCluster(): boolean {
  return Boolean(process.env.KUBERNETES_SERVICE_HOST);
}

// Refused inside the cluster, so a leaked dev secret cannot impersonate a
// service there.
function devSecretOutsideCluster(secret: string): string {
  return inCluster() ? "" : secret.trim();
}

function hmac(secret: string, value: string): string {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

function sameString(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function decode<T>(segment: string): T | null {
  try {
    return JSON.parse(Buffer.from(segment, "base64url").toString("utf8")) as T;
  } catch {
    return null;
  }
}

function encode(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

/**
 * Identifies this service on its calls to others. In the cluster each pod
 * holds one Kubernetes service account token per service it calls, bound to
 * that service and rotated by the kubelet.
 */
export class ServiceCaller {
  private readonly devSecret: string;

  constructor(private readonly config: ServiceIdentityConfig) {
    this.devSecret = devSecretOutsideCluster(config.devSecret);
  }

  /** Headers for a call to callee, or null when this process cannot identify itself. */
  headers(callee: string, on: ActingFor = {}): Record<string, string> | null {
    // Acting for a tenant that is named but empty is a caller bug, not a
    // platform call; the call is not made.
    if (on.tenantId !== undefined && !on.tenantId.trim()) return null;
    const token = this.tokenFor(callee);
    const legacy = this.legacyToken(on);
    if (!token && !legacy) return null;
    const headers: Record<string, string> = {};
    if (token) headers[SERVICE_TOKEN_HEADER] = token;
    if (on.tenantId?.trim()) headers[ACTING_FOR_TENANT_HEADER] = on.tenantId.trim();
    if (on.userId?.trim()) headers[ACTING_FOR_USER_HEADER] = on.userId.trim();
    if (legacy) headers.authorization = `Bearer ${legacy}`;
    return headers;
  }

  private tokenFor(callee: string): string {
    try {
      return readFileSync(join(this.config.tokenDir, callee, "token"), "utf8").trim();
    } catch {
      if (!this.devSecret) return "";
    }
    const payload = encode({
      iss: DEV_ISSUER,
      sub: `${SERVICE_ACCOUNT_PREFIX}dev:${this.config.self}`,
      aud: [callee],
      exp: Math.floor(Date.now() / 1000) + DEV_TOKEN_SECONDS,
    });
    return `${payload}.${hmac(this.devSecret, payload)}`;
  }

  private legacyToken(on: ActingFor): string {
    const secret = this.config.legacySecret.trim();
    const tenantId = on.tenantId?.trim() || SYSTEM_TENANT_ID;
    if (!secret || !on.legacyRole) return "";
    const payload = encode({
      sub: `${this.config.self}-service`,
      email: `${this.config.self}-service@truckmoov.local`,
      role: on.legacyRole,
      tenantId,
      exp: Math.floor(Date.now() / 1000) + DEV_TOKEN_SECONDS,
    });
    return `${payload}.${hmac(secret, payload)}`;
  }
}

type ServiceTokenPayload = { iss?: string; sub?: string; aud?: string | string[]; exp?: number; nbf?: number };
type ClusterJwk = JsonWebKey & { kid?: string };

/** namespace is this pod's own: only service accounts from it are callers. */
export type ClusterKeySource = () => Promise<{ issuer: string; namespace: string; keys: ClusterJwk[] }>;

/** Checks the token a calling service presents, and names the caller. */
export class ServiceTokenVerifier {
  private readonly devSecret: string;
  private keys = new Map<string, KeyObject>();
  private issuer = "";
  private namespace = "";
  private fetchedAt = 0;

  constructor(
    private readonly self: string,
    devSecret: string,
    private readonly clusterKeys: ClusterKeySource | null = inCluster() ? fetchClusterKeys : null,
  ) {
    this.devSecret = devSecretOutsideCluster(devSecret);
  }

  async verify(token: string | undefined): Promise<string | null> {
    const parts = (token ?? "").trim().split(".");
    if (parts.length === 3 && this.clusterKeys) {
      const payload = await this.verifyCluster(parts);
      return payload ? this.caller(payload, this.namespace) : null;
    }
    if (parts.length === 2 && this.devSecret) {
      if (!sameString(parts[1], hmac(this.devSecret, parts[0]))) return null;
      const payload = decode<ServiceTokenPayload>(parts[0]);
      return payload?.iss === DEV_ISSUER ? this.caller(payload, "dev") : null;
    }
    return null;
  }

  private async verifyCluster([header, payload, signature]: string[]): Promise<ServiceTokenPayload | null> {
    const parsed = decode<{ alg?: string; kid?: string }>(header);
    if (parsed?.alg !== "RS256") return null;
    const key = await this.keyFor(parsed.kid ?? "");
    if (!key) return null;
    const valid = verify("RSA-SHA256", Buffer.from(`${header}.${payload}`), key, Buffer.from(signature, "base64url"));
    const claims = valid ? decode<ServiceTokenPayload>(payload) : null;
    return claims?.iss === this.issuer ? claims : null;
  }

  // Fetches again when a token names a key not seen yet, at most once a minute.
  private async keyFor(kid: string): Promise<KeyObject | undefined> {
    if (this.keys.has(kid) || !this.clusterKeys || Date.now() - this.fetchedAt < 60_000) {
      return this.keys.get(kid);
    }
    this.fetchedAt = Date.now();
    try {
      const { issuer, namespace, keys } = await this.clusterKeys();
      this.issuer = issuer;
      this.namespace = namespace;
      this.keys = new Map(keys.filter((k) => k.kty === "RSA").map((k) => [k.kid ?? "", createPublicKey({ key: k, format: "jwk" })]));
    } catch {
      return undefined;
    }
    return this.keys.get(kid);
  }

  private caller(payload: ServiceTokenPayload, namespace: string): string | null {
    const now = Math.floor(Date.now() / 1000);
    const audience = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (typeof payload.exp !== "number" || payload.exp <= now || (payload.nbf ?? 0) > now) return null;
    if (!audience.includes(this.self)) return null;
    const account = payload.sub?.startsWith(SERVICE_ACCOUNT_PREFIX) ? payload.sub.slice(SERVICE_ACCOUNT_PREFIX.length) : "";
    const [ns, name] = account.split(":");
    return namespace && ns === namespace && name ? name : null;
  }
}

function getJson<T>(path: string, token: string, ca: Buffer): Promise<T> {
  return new Promise((resolve, reject) => {
    const req = request(`${CLUSTER_API}${path}`, { headers: { authorization: `Bearer ${token}` }, ca, timeout: 5000 }, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => {
        if (res.statusCode !== 200) return reject(new Error(`${path}: ${res.statusCode}`));
        try {
          resolve(JSON.parse(body) as T);
        } catch (error) {
          reject(error);
        }
      });
    });
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error(`${path}: timeout`)));
    req.end();
  });
}

/** The issuer and keys the API server publishes for service account tokens. */
async function fetchClusterKeys(): Promise<{ issuer: string; namespace: string; keys: ClusterJwk[] }> {
  const token = readFileSync(join(SERVICE_ACCOUNT_DIR, "token"), "utf8").trim();
  const namespace = readFileSync(join(SERVICE_ACCOUNT_DIR, "namespace"), "utf8").trim();
  const ca = readFileSync(join(SERVICE_ACCOUNT_DIR, "ca.crt"));
  const discovery = await getJson<{ issuer: string }>("/.well-known/openid-configuration", token, ca);
  const jwks = await getJson<{ keys: ClusterJwk[] }>("/openid/v1/jwks", token, ca);
  return { issuer: discovery.issuer, namespace, keys: jwks.keys };
}

/** The identity settings every service reads from its configuration. */
export type IdentitySettings = {
  identity: { legacySecret: string; serviceTokenDir: string; serviceAuthDevSecret: string };
};

/** Identifies the named service on its calls to others. */
export function createServiceCaller(config: IdentitySettings, self: string): ServiceCaller {
  const { serviceTokenDir, serviceAuthDevSecret, legacySecret } = config.identity;
  return new ServiceCaller({ self, tokenDir: serviceTokenDir, devSecret: serviceAuthDevSecret, legacySecret });
}

/** Checks the services calling the named one. */
export function createServiceTokenVerifier(config: IdentitySettings, self: string): ServiceTokenVerifier {
  return new ServiceTokenVerifier(self, config.identity.serviceAuthDevSecret);
}
