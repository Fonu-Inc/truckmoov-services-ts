import { Inject, Injectable } from '@nestjs/common';
import { AppConfigService } from '@shared/config';
import {
  ACTING_FOR_TENANT_HEADER,
  SERVICE_TOKEN_HEADER,
  type ServiceTokenVerifier,
  createServiceTokenVerifier,
} from '@shared/identity';

export type IncomingHeaders = Record<string, string | string[] | undefined>;

function single(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? '';
}

/**
 * Who is calling auth's service-to-service routes, and for which tenant.
 *
 * A service proves who it is with its own token and names the tenant it acts
 * for; each route lists the services it serves. A user token is never accepted.
 */
@Injectable()
export class InternalCallerService {
  private readonly services: ServiceTokenVerifier;

  constructor(@Inject(AppConfigService) config: AppConfigService) {
    this.services = createServiceTokenVerifier(config, 'auth');
  }

  /** The calling service when it is one of allowed; no older token stands in for it. */
  async serviceFor(headers: IncomingHeaders, allowed: readonly string[]): Promise<string | null> {
    const service = await this.services.verify(single(headers[SERVICE_TOKEN_HEADER]));
    return service && allowed.includes(service) ? service : null;
  }

  /** The tenant the call is made for, or null when the caller is not one of allowed. */
  async tenantFor(headers: IncomingHeaders, allowed: readonly string[]): Promise<string | null> {
    if (!(await this.serviceFor(headers, allowed))) return null;
    return single(headers[ACTING_FOR_TENANT_HEADER]) || null;
  }
}
