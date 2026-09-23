import { Inject, Injectable } from '@nestjs/common';
import { AppConfigService } from '@shared/config';
import {
  ACTING_FOR_TENANT_HEADER,
  SERVICE_TOKEN_HEADER,
  type ServiceTokenVerifier,
  createServiceTokenVerifier,
} from '@shared/identity';
import { TOKEN_SERVICE } from './contexts/auth/session';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';

export type IncomingHeaders = Record<string, string | string[] | undefined>;

function single(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? '';
}

/**
 * Who is calling auth's service-to-service routes, and for which tenant.
 *
 * A service proves who it is with its own token and names the tenant it acts
 * for; each route lists the services it serves. Until the compatibility
 * window closes, the older user-shaped token callers still send is accepted
 * in its place.
 */
@Injectable()
export class InternalCallerService {
  private readonly services: ServiceTokenVerifier;

  constructor(
    @Inject(AppConfigService) config: AppConfigService,
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
  ) {
    this.services = createServiceTokenVerifier(config, 'auth');
  }

  /** The tenant the call is made for, or null when the caller is not one of allowed. */
  async tenantFor(headers: IncomingHeaders, allowed: readonly string[]): Promise<string | null> {
    const service = await this.services.verify(single(headers[SERVICE_TOKEN_HEADER]));
    if (service) {
      return allowed.includes(service) ? single(headers[ACTING_FOR_TENANT_HEADER]) || null : null;
    }
    const [scheme, token] = single(headers.authorization).split(' ');
    if (scheme?.toLowerCase() !== 'bearer' || !token) return null;
    return this.tokenService.resolveAccessToken(token)?.tenantId ?? null;
  }
}
