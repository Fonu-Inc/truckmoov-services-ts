import { Inject, Injectable } from '@nestjs/common';
import { TOKEN_SERVICE, USER_REPOSITORY } from './contexts/auth/session';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import { ensureSystemActor, SYSTEM_MUTATOR_ROLES } from './system-authz';
import {
  SIM_PROVISIONING_REQUEST_REPOSITORY,
  type SimProvisioningRequestRepository,
} from './sim-provisioning-request.repository';
import {
  SimRequestNotFoundError,
  SimRequestAlreadyProcessedError,
} from './approve-system-sim-request.use-case';

@Injectable()
export class RejectSystemSimRequestUseCase {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(SIM_PROVISIONING_REQUEST_REPOSITORY)
    private readonly requestRepo: SimProvisioningRequestRepository,
  ) {}

  async execute(accessToken: string, requestId: string, reason: string) {
    await ensureSystemActor(accessToken, this.tokenService, this.userRepository, {
      allowedRoles: SYSTEM_MUTATOR_ROLES,
      forbiddenMessage: 'You are not permitted to reject SIM requests',
    });

    const request = await this.requestRepo.findById(requestId);
    if (!request) throw new SimRequestNotFoundError(requestId);
    if (request.status !== 'pending')
      throw new SimRequestAlreadyProcessedError(requestId, request.status);

    const now = new Date();
    request.status = 'rejected';
    request.rejectedReason = reason;
    request.updatedAt = now;
    await this.requestRepo.save(request);

    return {
      status: true,
      message: 'SIM provisioning request rejected',
      data: {
        requestId: request.id,
        tenantName: request.tenantName,
        reason,
      },
    };
  }
}
