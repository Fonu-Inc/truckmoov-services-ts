import {
  type CanActivate,
  ConflictException,
  type ExecutionContext,
  Inject,
  Injectable,
  Logger,
} from "@nestjs/common";
import axios from "axios";
import { AppConfigService } from "@shared/config";
import { ONBOARDING_IN_PROGRESS } from "@shared/http";
import { SYSTEM_TENANT_ID, type ServiceCaller, createServiceCaller } from "@shared/identity";

/**
 * Refuses device additions with 409 onboarding_in_progress while the tenant's
 * onboarding is not fleet_ready. Auth owns onboarding, so it decides.
 */
@Injectable()
export class OnboardingSettledGuard implements CanActivate {
  private readonly logger = new Logger(OnboardingSettledGuard.name);
  private readonly caller: ServiceCaller;

  constructor(@Inject(AppConfigService) private readonly config: AppConfigService) {
    this.caller = createServiceCaller(config, "fleet");
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const tenantId = context.switchToHttp().getRequest<{ user?: { tenantId?: string } }>().user?.tenantId;
    if (!tenantId || tenantId === SYSTEM_TENANT_ID) return true;
    if (await this.isPending(tenantId)) throw new ConflictException(ONBOARDING_IN_PROGRESS);
    return true;
  }

  // shortcut: fails open when auth is unreachable, like the entitlement reader; auth still blocks purchases itself.
  private async isPending(tenantId: string): Promise<boolean> {
    const headers = this.caller.headers("auth", { tenantId });
    if (!headers) return false;
    try {
      const response = await axios.get<{ data?: { pending?: boolean } }>(
        `${this.config.auth.serviceUrl}/auth/internal/onboarding-gate`,
        { headers, timeout: 2000, validateStatus: () => true },
      );
      return response.status === 200 && response.data?.data?.pending === true;
    } catch (error) {
      this.logger.warn(`onboarding_gate_failed:${error instanceof Error ? error.message : "unknown"}`);
      return false;
    }
  }
}
