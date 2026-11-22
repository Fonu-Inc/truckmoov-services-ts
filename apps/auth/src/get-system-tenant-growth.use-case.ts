import { Inject, Injectable } from '@nestjs/common';
import { lagosDate } from '@auth/onboarding';
import { TOKEN_SERVICE, USER_REPOSITORY } from './contexts/auth/session';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import { DEFAULT_REVENUE_MONTHS, MAX_REVENUE_MONTHS } from './get-system-revenue-by-month.use-case';
import { lagosMonthWindow } from './tenant-collections.repository';
import { ListSystemTenantsUseCase } from './list-system-tenants.use-case';
import { ensureSystemActor } from './system-authz';

export function cumulativeTenants(keys: string[], createdByMonth: Map<string, number>) {
  let total = [...createdByMonth].reduce((sum, [month, count]) => (month < keys[0] ? sum + count : sum), 0);
  return keys.map((month) => {
    total += createdByMonth.get(month) ?? 0;
    return { month, tenants: total };
  });
}

@Injectable()
export class GetSystemTenantGrowthUseCase {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(ListSystemTenantsUseCase)
    private readonly listSystemTenantsUseCase: ListSystemTenantsUseCase,
  ) {}

  async execute(accessToken: string, months?: number) {
    await ensureSystemActor(accessToken, this.tokenService, this.userRepository, {
      forbiddenMessage: 'You are not permitted to view tenant growth',
    });
    const { keys } = lagosMonthWindow(new Date(), this.clamp(months));

    // Use the same tenant set as the list and summary. The old growth query only
    // counted auth_users and onboarding rows, so a tenant with fleet/settings
    // data but no user was missing here while appearing on the Tenants page.
    const tenants = await this.listSystemTenantsUseCase.list(accessToken, {});
    const createdByMonth = new Map<string, number>();
    for (const tenant of tenants) {
      const month = lagosDate(new Date(tenant.createdAt)).slice(0, 7);
      createdByMonth.set(month, (createdByMonth.get(month) ?? 0) + 1);
    }

    return {
      status: true,
      message: 'success',
      data: { months: cumulativeTenants(keys, createdByMonth), generatedAt: new Date().toISOString() },
    };
  }

  private clamp(months?: number) {
    if (!Number.isInteger(months) || !months) return DEFAULT_REVENUE_MONTHS;
    return Math.min(Math.max(months, 1), MAX_REVENUE_MONTHS);
  }
}
