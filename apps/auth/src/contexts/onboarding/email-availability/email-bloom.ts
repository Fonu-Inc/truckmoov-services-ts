import { createHash } from 'node:crypto';

export const BLOOM_BITS = 1 << 20;
export const BLOOM_HASHES = 7;

/** Double hashing: one digest yields every probe position for the value. */
export function bloomPositions(value: string, bits = BLOOM_BITS, hashes = BLOOM_HASHES): number[] {
  const digest = createHash('sha256').update(value).digest();
  const first = digest.readUInt32BE(0);
  const step = (digest.readUInt32BE(4) | 1) >>> 0;
  return Array.from({ length: hashes }, (_, index) => (first + index * step) % bits);
}
