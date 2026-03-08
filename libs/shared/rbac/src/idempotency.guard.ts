import {
  BadRequestException,
  CanActivate,
  ConflictException,
  ExecutionContext,
  Inject,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { IDEMPOTENCY_KEY } from "./idempotency.decorator";

@Injectable()
export class IdempotencyGuard implements CanActivate {
  private readonly seenKeys = new Set<string>();

  constructor(
    // Explicit token keeps guard wiring stable even with transpilers that drop metadata.
    @Inject(Reflector)
    private readonly reflector: Reflector,
  ) {}

  canActivate(context: ExecutionContext): boolean {
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
      throw new BadRequestException(
        "Missing idempotency key header: Idempotency-Key",
      );
    }

    const requestFingerprint = `${request.method}:${request.originalUrl}:${key}`;
    if (this.seenKeys.has(requestFingerprint)) {
      throw new ConflictException("Duplicate idempotent request");
    }

    this.seenKeys.add(requestFingerprint);
    return true;
  }
}
