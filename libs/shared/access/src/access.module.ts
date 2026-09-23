import type { Provider, Type } from "@nestjs/common";
import { APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";
import { AppConfigService } from "@shared/config";
import { HideForbiddenInterceptor } from "./hide-forbidden.interceptor";
import { PortalGuard } from "./portal.guard";
import {
  CALLER_AUDIENCE,
  PORTAL_ENFORCEMENT,
  REFUSAL_REPORTER,
  type CallerAudienceResolver,
  type RefusalReporter,
} from "./portals";

export type AccessOptions = {
  callers: Type<CallerAudienceResolver>;
  reporter: Type<RefusalReporter>;
};

/**
 * Installs the portal rule on every route of the service. Spread into the
 * service's root module, so the resolver and reporter can use its providers.
 */
export function accessProviders(options: AccessOptions): Provider[] {
  return [
    { provide: CALLER_AUDIENCE, useClass: options.callers },
    { provide: REFUSAL_REPORTER, useClass: options.reporter },
    {
      provide: PORTAL_ENFORCEMENT,
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => config.portalEnforced,
    },
    PortalGuard,
    { provide: APP_GUARD, useExisting: PortalGuard },
    { provide: APP_INTERCEPTOR, useClass: HideForbiddenInterceptor },
  ];
}
