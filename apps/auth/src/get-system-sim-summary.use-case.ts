import { Inject, Injectable } from '@nestjs/common';
import { TOKEN_SERVICE, USER_REPOSITORY } from './contexts/auth/session';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import { ensureSystemActor } from './system-authz';
import { SIM_REPOSITORY, type SimRepository } from './sim.repository';
import {
  SIM_PROVISIONING_REQUEST_REPOSITORY,
  type SimProvisioningRequestRepository,
} from './sim-provisioning-request.repository';

@Injectable()
export class GetSystemSimSummaryUseCase {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(SIM_REPOSITORY) private readonly simRepo: SimRepository,
    @Inject(SIM_PROVISIONING_REQUEST_REPOSITORY)
    private readonly requestRepo: SimProvisioningRequestRepository,
  ) {}

  async execute(accessToken: string) {
    await ensureSystemActor(accessToken, this.tokenService, this.userRepository, {
      forbiddenMessage: 'You are not permitted to view SIM summary data',
    });

    const [byStatus, byCarrier, pendingRequests] = await Promise.all([
      this.simRepo.countByStatus(),
      this.simRepo.countByCarrier(),
      this.requestRepo.findAll({ status: 'pending' }),
    ]);

    const total = Object.values(byStatus).reduce((sum, n) => sum + n, 0);

    return {
      status: true,
      message: 'SIM summary retrieved',
      data: {
        total,
        byStatus,
        byCarrier,
        pendingRequests: pendingRequests.length,
      },
    };
  }
}
