import {
  type CanActivate,
  ConflictException,
  type ExecutionContext,
  Inject,
  Injectable,
} from '@nestjs/common';
import { SYSTEM_TENANT_ID } from '@shared/identity';
import { ONBOARDING_IN_PROGRESS } from '@shared/http';
import { TOKEN_SERVICE } from './contexts/auth/session';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import {
  ONBOARDING_APPLICATION_REPOSITORY,
  type OnboardingApplicationRepository,
} from './contexts/onboarding/domain/onboarding-application.repository';

/**
 * Whether a tenant is still onboarding: its latest application exists and has not
 * reached fleet_ready. Tenants created without an application are never held.
 */
@Injectable()
export class OnboardingGate {
  constructor(
    @Inject(ONBOARDING_APPLICATION_REPOSITORY)
    private readonly applications: OnboardingApplicationRepository,
  ) {}

  async isPending(tenantId: string): Promise<boolean> {
    if (!tenantId || tenantId === SYSTEM_TENANT_ID) return false;
    const application = await this.applications.findLatestByTenantId(tenantId);
    return application !== null && application.stage !== 'fleet_ready';
  }

  async assertSettled(tenantId: string): Promise<void> {
    if (await this.isPending(tenantId)) throw new ConflictException(ONBOARDING_IN_PROGRESS);
  }
}

/** Refuses purchases and device/SIM additions with 409 onboarding_in_progress until the installation is done. */
@Injectable()
export class OnboardingSettledGuard implements CanActivate {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokens: TokenService,
    @Inject(OnboardingGate) private readonly gate: OnboardingGate,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const header = context.switchToHttp().getRequest<{ headers: Record<string, string | string[] | undefined> }>()
      .headers.authorization;
    const [scheme, token] = ((Array.isArray(header) ? header[0] : header) ?? '').split(' ');
    // A missing or bad token is the handler's 401 to give.
    const actor = scheme?.toLowerCase() === 'bearer' && token ? this.tokens.resolveAccessToken(token) : null;
    if (actor) await this.gate.assertSettled(actor.tenantId);
    return true;
  }
}
