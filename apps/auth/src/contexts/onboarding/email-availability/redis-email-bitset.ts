import type { EmailBitset } from './email-bitset';

const KEY = 'onboarding:taken-emails';

interface BitPipeline {
  setbit(key: string, offset: number, value: 0 | 1): BitPipeline;
  getbit(key: string, offset: number): BitPipeline;
  exec(): Promise<Array<[Error | null, unknown]> | null>;
}

export interface BitRedis {
  pipeline(): BitPipeline;
}

/** One bitset in Redis, so every auth replica reads and fills the same filter. */
export class RedisEmailBitset implements EmailBitset {
  constructor(private readonly redis: BitRedis) {}

  async set(positions: number[]): Promise<void> {
    if (positions.length === 0) return;
    const pipeline = this.redis.pipeline();
    for (const position of positions) pipeline.setbit(KEY, position, 1);
    await this.run(pipeline);
  }

  async hasAll(positions: number[]): Promise<boolean> {
    const pipeline = this.redis.pipeline();
    for (const position of positions) pipeline.getbit(KEY, position);
    const results = await this.run(pipeline);
    return results.every(([, bit]) => bit === 1);
  }

  private async run(pipeline: BitPipeline): Promise<Array<[Error | null, unknown]>> {
    const results = await pipeline.exec();
    if (!results) throw new Error('redis pipeline returned nothing');
    const failed = results.find(([error]) => error);
    if (failed?.[0]) throw failed[0];
    return results;
  }
}
