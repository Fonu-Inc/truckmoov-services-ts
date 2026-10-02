import { Inject, Injectable } from '@nestjs/common';
import { TOKEN_SERVICE, USER_REPOSITORY } from './contexts/auth/session';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import { ensureSystemActor } from './system-authz';
import { SIM_REPOSITORY, type SimRepository } from './sim.repository';
import { periodDays, type SnapshotPeriod } from './system-snapshot-period';

@Injectable()
export class GetSystemSimCarrierBreakdownUseCase {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(SIM_REPOSITORY) private readonly simRepo: SimRepository,
  ) {}

  async execute(accessToken: string, period: SnapshotPeriod) {
    await ensureSystemActor(accessToken, this.tokenService, this.userRepository, {
      forbiddenMessage: 'You are not permitted to view SIM summary data',
    });
    const byCarrier = await this.simRepo.countByCarrier(periodDays(period));
    return {
      status: true,
      message: 'SIM carrier breakdown retrieved',
      data: { period, byCarrier, generatedAt: new Date().toISOString() },
    };
  }
}
