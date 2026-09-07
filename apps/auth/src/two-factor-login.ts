import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * The short-lived ticket handed out between password and code.
 *
 * Signed rather than stored: it carries only who it is for and when it dies,
 * and the signature is what makes it unforgeable. A stored challenge would be
 * a second session table to expire, revoke and clean up for something that
 * lives ninety seconds.
 *
 * It is deliberately not an access token — it authorises exactly one thing,
 * completing this login, and carries no role.
 */
export const CHALLENGE_TTL_SECONDS = 300;

export type TwoFactorChallenge = {
  userId: string;
  audience: string;
  expiresAt: number;
};

export function issueChallengeToken(
  challenge: Omit<TwoFactorChallenge, 'expiresAt'>,
  secret: string,
  nowMs = Date.now(),
): string {
  const payload: TwoFactorChallenge = {
    ...challenge,
    expiresAt: Math.floor(nowMs / 1000) + CHALLENGE_TTL_SECONDS,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${encoded}.${sign(encoded, secret)}`;
}

export function readChallengeToken(
  token: string,
  secret: string,
  nowMs = Date.now(),
): TwoFactorChallenge | null {
  const [encoded, signature] = token.split('.');
  if (!encoded || !signature) return null;
  if (!signatureMatches(encoded, signature, secret)) return null;

  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString()) as TwoFactorChallenge;
    if (typeof payload.userId !== 'string' || typeof payload.expiresAt !== 'number') return null;
    if (payload.expiresAt * 1000 <= nowMs) return null;
    return payload;
  } catch {
    return null;
  }
}

function sign(encoded: string, secret: string): string {
  return createHmac('sha256', secret).update(encoded).digest('base64url');
}

function signatureMatches(encoded: string, signature: string, secret: string): boolean {
  const expected = Buffer.from(sign(encoded, secret));
  const given = Buffer.from(signature);
  if (expected.length !== given.length) return false;
  return timingSafeEqual(expected, given);
}

/**
 * Whether this login has to present a second factor.
 *
 * Two ways in: the platform requires it of everyone, or this person chose to
 * turn it on. An unconfirmed enrolment counts as neither — the authenticator
 * was never proven to work, so demanding a code from it would lock the account.
 */
export function twoFactorRequiredForLogin(input: {
  platformRequires: boolean;
  enrolmentConfirmed: boolean;
}): boolean {
  return input.enrolmentConfirmed || input.platformRequires;
}

/**
 * What to tell someone the platform requires a code from who has never
 * enrolled. They cannot be refused outright — that would lock every existing
 * administrator out the moment the setting was switched on — so they are sent
 * to enrol instead.
 */
export function loginChallengeKind(input: {
  platformRequires: boolean;
  enrolmentConfirmed: boolean;
}): 'code' | 'enrolment_required' | 'none' {
  if (input.enrolmentConfirmed) return 'code';
  if (input.platformRequires) return 'enrolment_required';
  return 'none';
}
