import {
  CanActivate,
  ConflictException,
  ExecutionContext,
  Inject,
  Injectable,
  Optional,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { AppConfigService } from "@shared/config";
import { IDEMPOTENCY_KEY } from "./idempotency.decorator";
import { REDIS_CLIENT, type RedisLike } from "./redis.provider";

@Injectable()
export class IdempotencyGuard implements CanActivate {
  // Per-replica fallback used only when Redis is unavailable.
  private readonly seenKeys = new Set<string>();
  private readonly ttlSeconds: number;

  constructor(
    // Explicit token keeps guard wiring stable even with transpilers that drop metadata.
    @Inject(Reflector)
    private readonly reflector: Reflector,
    @Optional()
    @Inject(REDIS_CLIENT)
    private readonly redis: RedisLike | null = null,
    @Optional()
    @Inject(AppConfigService)
    config?: AppConfigService,
  ) {
    this.ttlSeconds = config?.redis.idempotencyTtlSeconds ?? 86_400;
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<boolean>(IDEMPOTENCY_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!required) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const keyHeader = request.headers["idempotency-key"];
    const key = Array.isArray(keyHeader) ? keyHeader[0] : keyHeader;

    if (!key || typeof key !== "string") {
      // UI form posts are allowed to proceed without an idempotency key.
      // When a client does supply the header, we enforce duplicate protection.
      return true;
    }

    const fingerprint = `${request.method}:${request.originalUrl}:${key}`;

    // Prefer Redis (shared across replicas, survives restarts). SET NX only
    // succeeds for the first request; a null reply means the key already exists.
    if (this.redis) {
      try {
        const stored = await this.redis.set(`idem:${fingerprint}`, "1", "EX", this.ttlSeconds, "NX");
        if (stored === null) {
          throw new ConflictException("Duplicate idempotent request");
        }
        return true;
      } catch (error) {
        if (error instanceof ConflictException) throw error;
        // Redis unreachable — degrade to the in-memory fallback below.
      }
    }

    if (this.seenKeys.has(fingerprint)) {
      throw new ConflictException("Duplicate idempotent request");
    }
    this.seenKeys.add(fingerprint);
    return true;
  }
}
