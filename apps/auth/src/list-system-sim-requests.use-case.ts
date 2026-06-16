import { Inject, Injectable } from '@nestjs/common';
import { TOKEN_SERVICE, USER_REPOSITORY } from './contexts/auth/session';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import { ensureSystemActor } from './system-authz';
import {
  SIM_PROVISIONING_REQUEST_REPOSITORY,
  type SimProvisioningRequestFilters,
  type SimProvisioningRequestRepository,
} from './sim-provisioning-request.repository';

@Injectable()
export class ListSystemSimRequestsUseCase {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(SIM_PROVISIONING_REQUEST_REPOSITORY)
    private readonly requestRepo: SimProvisioningRequestRepository,
  ) {}

  async execute(accessToken: string, filters?: SimProvisioningRequestFilters) {
    await ensureSystemActor(accessToken, this.tokenService, this.userRepository, {
      forbiddenMessage: 'You are not permitted to view SIM provisioning requests',
    });

    const requests = await this.requestRepo.findAll(filters);

    return {
      status: true,
      message: 'SIM provisioning requests retrieved',
      data: {
        total: requests.length,
        requests: requests.map((r) => ({
          ...r,
          approvedAt: r.approvedAt?.toISOString() ?? null,
          createdAt: r.createdAt.toISOString(),
          updatedAt: r.updatedAt.toISOString(),
        })),
      },
    };
  }
}
