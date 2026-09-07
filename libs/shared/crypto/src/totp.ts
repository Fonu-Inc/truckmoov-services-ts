import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * TOTP as RFC 6238, on the parameters every authenticator app assumes by
 * default: SHA-1, six digits, a thirty second step. They are not choices — an
 * app scanning the QR code has no way to be told otherwise for SHA-1, and
 * changing them silently breaks enrolment for anyone already set up.
 */
export const TOTP_DIGITS = 6;
export const TOTP_PERIOD_SECONDS = 30;

/**
 * How many steps either side of now are accepted.
 *
 * One step, so a code stays usable for up to about ninety seconds. Phone
 * clocks drift and people type slowly; a zero-tolerance window produces
 * "wrong code" for a code that was right when it was read.
 */
export const TOTP_WINDOW_STEPS = 1;

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** A 160-bit secret, which is what SHA-1 HMAC consumes without padding. */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

export function totpCodeAt(secret: string, atMs: number): string {
  const counter = Math.floor(atMs / 1000 / TOTP_PERIOD_SECONDS);
  return hotp(base32Decode(secret), counter);
}

/**
 * Whether a code is valid now.
 *
 * Compared in constant time. A timing-distinguishable comparison on a
 * six-digit code is worth closing: the search space is small enough that
 * leaking position information matters.
 */
export function verifyTotp(secret: string, code: string, atMs = Date.now()): boolean {
  const cleaned = code.replace(/\D/g, '');
  if (cleaned.length !== TOTP_DIGITS) return false;

  let key: Buffer;
  try {
    key = base32Decode(secret);
  } catch {
    return false;
  }

  const counter = Math.floor(atMs / 1000 / TOTP_PERIOD_SECONDS);
  for (let offset = -TOTP_WINDOW_STEPS; offset <= TOTP_WINDOW_STEPS; offset += 1) {
    if (constantTimeEquals(hotp(key, counter + offset), cleaned)) return true;
  }
  return false;
}

/**
 * The URI an authenticator app reads from the QR code.
 *
 * The issuer is repeated as a parameter as well as a label prefix because
 * different apps read one or the other, and an entry that says only the email
 * address is indistinguishable from every other account that person holds.
 */
export function totpEnrolmentUri(input: {
  secret: string;
  accountName: string;
  issuer: string;
}): string {
  const label = encodeURIComponent(`${input.issuer}:${input.accountName}`);
  const params = new URLSearchParams({
    secret: input.secret,
    issuer: input.issuer,
    algorithm: 'SHA1',
    digits: String(TOTP_DIGITS),
    period: String(TOTP_PERIOD_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

function hotp(key: Buffer, counter: number): string {
  const buffer = Buffer.alloc(8);
  // Written as two 32-bit halves: a counter this size exceeds what a bitwise
  // write would hold, and it is a signed shift that would corrupt it.
  buffer.writeUInt32BE(Math.floor(counter / 2 ** 32), 0);
  buffer.writeUInt32BE(counter % 2 ** 32, 4);

  const digest = createHmac('sha1', key).update(buffer).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24)
    | ((digest[offset + 1] & 0xff) << 16)
    | ((digest[offset + 2] & 0xff) << 8)
    | (digest[offset + 3] & 0xff);

  return String(binary % 10 ** TOTP_DIGITS).padStart(TOTP_DIGITS, '0');
}

function constantTimeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';

  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

export function base32Decode(input: string): Buffer {
  // Padding and lower case are both common in secrets people paste by hand.
  const cleaned = input.toUpperCase().replace(/=+$/, '').replace(/\s/g, '');
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];

  for (const character of cleaned) {
    const index = BASE32_ALPHABET.indexOf(character);
    if (index === -1) throw new Error('secret is not valid base32');

    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
}
