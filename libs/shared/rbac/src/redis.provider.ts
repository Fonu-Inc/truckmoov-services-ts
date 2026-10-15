import { Provider } from "@nestjs/common";
import { AppConfigService } from "@shared/config";
import Redis from "ioredis";

export const REDIS_CLIENT = Symbol("REDIS_CLIENT");

// Minimal surface the idempotency guard depends on — keeps the guard testable
// with a light mock and decoupled from the concrete ioredis type.
export interface RedisLike {
  set(...args: any[]): Promise<unknown>;
  del(...args: any[]): Promise<unknown>;
}

// Builds a lazily-connecting Redis client, or null when disabled. Commands
// fail fast (commandTimeout) so the guard can fall back to its in-memory path
// instead of hanging when Redis is unreachable.
export const RedisClientProvider: Provider = {
  provide: REDIS_CLIENT,
  inject: [AppConfigService],
  useFactory: (config: AppConfigService): RedisLike | null => {
    const { enabled, host, port, password, keyPrefix } = config.redis;
    if (!enabled) return null;
    return new Redis({
      host,
      port,
      password,
      keyPrefix,
      lazyConnect: true,
      commandTimeout: 1000,
      maxRetriesPerRequest: 2,
      retryStrategy: (times) => (times > 5 ? null : Math.min(times * 200, 1000)),
    });
  },
};
