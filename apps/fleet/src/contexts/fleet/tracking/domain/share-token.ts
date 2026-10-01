import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * A share token is a bearer credential for one vehicle's position.
 *
 * Only the hash is stored. A leaked database row then reveals which links
 * exist, but not a working link, which is the same reasoning applied to
 * onboarding tokens and password resets.
 */
export function mintShareToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashShareToken(token) };
}

export function hashShareToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function shareTokenMatches(candidate: string, storedHash: string): boolean {
  const candidateHash = Buffer.from(hashShareToken(candidate), "hex");
  const stored = Buffer.from(storedHash, "hex");
  if (candidateHash.length !== stored.length) return false;
  return timingSafeEqual(candidateHash, stored);
}

/** A link is usable only while it is unrevoked and inside its window. */
export function shareLinkIsLive(
  link: { expiresAt: Date; revokedAt: Date | null; heldAt?: Date | null },
  now = new Date(),
): boolean {
  if (link.revokedAt !== null || link.heldAt) return false;
  return link.expiresAt.getTime() > now.getTime();
}
