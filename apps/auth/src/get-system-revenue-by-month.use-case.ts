import { Inject, Injectable } from '@nestjs/common';
import { TOKEN_SERVICE, USER_REPOSITORY } from './contexts/auth/session';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import { ensureSystemActor } from './system-authz';
import {
  TENANT_COLLECTIONS_REPOSITORY,
  lagosMonthWindow,
  type TenantCollectionsRepository,
} from './tenant-collections.repository';

export const DEFAULT_REVENUE_MONTHS = 6;
export const MAX_REVENUE_MONTHS = 12;

@Injectable()
export class GetSystemRevenueByMonthUseCase {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(TENANT_COLLECTIONS_REPOSITORY) private readonly collections: TenantCollectionsRepository,
  ) {}

  async execute(accessToken: string, months?: number) {
    await ensureSystemActor(accessToken, this.tokenService, this.userRepository, {
      forbiddenMessage: 'You are not permitted to view platform revenue',
    });
    const count = this.clamp(months);
    const { keys, from, to } = lagosMonthWindow(new Date(), count);
    const kobo = await this.collections.collectedKoboByLagosMonth(from, to);
    return {
      status: true,
      message: 'success',
      data: {
        months: keys.map((month) => ({ month, collectedNgn: (kobo.get(month) ?? 0) / 100 })),
        generatedAt: new Date().toISOString(),
      },
    };
  }

  private clamp(months?: number) {
    if (!Number.isInteger(months) || !months) return DEFAULT_REVENUE_MONTHS;
    return Math.min(Math.max(months, 1), MAX_REVENUE_MONTHS);
  }
}
