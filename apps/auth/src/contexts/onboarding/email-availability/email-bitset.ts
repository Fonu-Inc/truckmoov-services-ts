import { BLOOM_BITS } from './email-bloom';

export const EMAIL_BITSET = Symbol('EMAIL_BITSET');

export interface EmailBitset {
  set(positions: number[]): Promise<void>;
  hasAll(positions: number[]): Promise<boolean>;
}

export class InMemoryEmailBitset implements EmailBitset {
  private readonly bits = new Uint8Array(BLOOM_BITS / 8);

  async set(positions: number[]): Promise<void> {
    for (const position of positions) this.bits[position >> 3]! |= 1 << (position & 7);
  }

  async hasAll(positions: number[]): Promise<boolean> {
    return positions.every((position) => (this.bits[position >> 3]! & (1 << (position & 7))) !== 0);
  }
}
