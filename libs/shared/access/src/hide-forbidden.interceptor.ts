import {
  ForbiddenException,
  Inject,
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from "@nestjs/common";
import { catchError, type Observable } from "rxjs";
import { CALLER_AUDIENCE, PORTAL_ENFORCEMENT, routeNotFound, type CallerAudienceResolver, type RequestLike } from "./portals";
import { PortalGuard } from "./portal.guard";

/**
 * A refusal decided deep inside a handler answers as a missing route too, so
 * no "you are not allowed" message tells a caller something is there. 401 is
 * left alone: it means the token needs refreshing, and the portals rely on it.
 */
@Injectable()
export class HideForbiddenInterceptor implements NestInterceptor {
  constructor(
    @Inject(PortalGuard) private readonly guard: PortalGuard,
    @Inject(CALLER_AUDIENCE) private readonly callers: CallerAudienceResolver,
    @Inject(PORTAL_ENFORCEMENT) private readonly enforce: boolean,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<RequestLike>();
    return next.handle().pipe(
      catchError(async (error: unknown) => {
        if (!(error instanceof ForbiddenException)) throw error;
        this.guard.refuse(req, await this.callers.resolve(req), "forbidden");
        throw this.enforce ? routeNotFound(req) : error;
      }),
    );
  }
}
