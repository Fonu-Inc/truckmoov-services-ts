import { createPublicKey, verify, type KeyObject } from 'node:crypto';

/** Firebase's App Check signing keys. Google rotates them; the docs say to cache for at most 6 h. */
export const APP_CHECK_JWKS_URL = 'https://firebaseappcheck.googleapis.com/v1/jwks';
const JWKS_TTL_MS = 6 * 60 * 60 * 1000;
// An unknown kid refetches the keys, but at most this often, so junk tokens cannot drive traffic to Google.
const UNKNOWN_KID_REFETCH_MS = 5 * 60 * 1000;

export type AppCheckSettings = {
  /** Firebase project number. Empty refuses every token. */
  projectNumber: string;
  /** Firebase app ids allowed to connect. Empty allows any app in the project. */
  appIds: string[];
};

type Jwks = { keys?: Array<{ kid?: string; kty?: string; n?: string; e?: string }> };

async function fetchJwks(): Promise<Jwks> {
  const response = await fetch(APP_CHECK_JWKS_URL, { signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error(`app_check_jwks_${response.status}`);
  return (await response.json()) as Jwks;
}

function decode<T>(segment: string): T | null {
  try {
    return JSON.parse(Buffer.from(segment, 'base64url').toString('utf8')) as T;
  } catch {
    return null;
  }
}

/**
 * Checks a Firebase App Check token: proof that a socket comes from a genuine build of the
 * mobile app on a genuine device. Verified by hand against Firebase's published keys, as
 * https://firebase.google.com/docs/app-check/custom-resource-backend describes, so no service
 * account is needed. Any failure, including Google being unreachable, reads as not verified.
 */
export class AppCheckVerifier {
  private keys = new Map<string, KeyObject>();
  private fetchedAt = 0;
  private refreshing?: Promise<void>;

  constructor(
    private readonly settings: AppCheckSettings,
    private readonly loadJwks: () => Promise<Jwks> = fetchJwks,
    private readonly now: () => number = Date.now,
  ) {}

  async verify(token: unknown): Promise<boolean> {
    const { projectNumber, appIds } = this.settings;
    if (!projectNumber || typeof token !== 'string') return false;
    const [h, p, s, extra] = token.split('.');
    if (!h || !p || !s || extra !== undefined) return false;

    const header = decode<{ alg?: string; typ?: string; kid?: string }>(h);
    if (header?.alg !== 'RS256' || header.typ !== 'JWT' || typeof header.kid !== 'string') return false;

    try {
      const key = await this.key(header.kid);
      if (!key || !verify('RSA-SHA256', Buffer.from(`${h}.${p}`), key, Buffer.from(s, 'base64url'))) return false;
    } catch {
      return false;
    }

    const claims = decode<{ iss?: string; aud?: unknown; exp?: number; sub?: string }>(p);
    if (!claims) return false;
    if (claims.iss !== `https://firebaseappcheck.googleapis.com/${projectNumber}`) return false;
    if (!Array.isArray(claims.aud) || !claims.aud.includes(`projects/${projectNumber}`)) return false;
    if (typeof claims.exp !== 'number' || claims.exp * 1000 <= this.now()) return false;
    if (typeof claims.sub !== 'string' || !claims.sub) return false;
    return appIds.length === 0 || appIds.includes(claims.sub);
  }

  private async key(kid: string): Promise<KeyObject | undefined> {
    const age = this.now() - this.fetchedAt;
    const stale = age > JWKS_TTL_MS;
    if (stale || (!this.keys.has(kid) && age > UNKNOWN_KID_REFETCH_MS)) {
      await (this.refreshing ??= this.refresh().finally(() => (this.refreshing = undefined)));
    }
    return this.keys.get(kid);
  }

  private async refresh(): Promise<void> {
    // Stamped before the call so a Google outage is retried on the same schedule, not on every socket.
    this.fetchedAt = this.now();
    const jwks = await this.loadJwks();
    const next = new Map<string, KeyObject>();
    for (const jwk of jwks.keys ?? []) {
      if (jwk.kty !== 'RSA' || !jwk.kid || !jwk.n || !jwk.e) continue;
      next.set(jwk.kid, createPublicKey({ key: { kty: 'RSA', n: jwk.n, e: jwk.e }, format: 'jwk' }));
    }
    this.keys = next;
  }
}
