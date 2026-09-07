import { Inject, Injectable, type NestMiddleware } from '@nestjs/common';
import { AppConfigService } from '@shared/config';
import { clientIpFrom } from '@shared/http';
import { runWithRequestContext } from './request-context';

type MiddlewareNext = (error?: unknown) => void;

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  constructor(@Inject(AppConfigService) private readonly config: AppConfigService) {}

  use(req: never, _res: unknown, next: MiddlewareNext): void {
    const ipAddress = clientIpFrom(req, {
      trustedProxies: this.config.audit.trustedProxies,
      header: this.config.audit.clientIpHeader,
    });

    // The rest of the request runs inside the context, so anything it calls
    // can read the address without being handed it.
    runWithRequestContext({ ipAddress }, () => next());
  }
}
