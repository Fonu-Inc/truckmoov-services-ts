import { Inject, Injectable } from '@nestjs/common';
import { TOKEN_SERVICE, USER_REPOSITORY } from './contexts/auth/session';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import { ensureSystemActor } from './system-authz';
import {
  SIM_PROVISIONING_REQUEST_REPOSITORY,
  type SimProvisioningRequestRepository,
} from './sim-provisioning-request.repository';

function isSameMonth(date: Date | null, ref: Date): boolean {
  if (!date) return false;
  return (
    date.getUTCFullYear() === ref.getUTCFullYear() &&
    date.getUTCMonth() === ref.getUTCMonth()
  );
}

@Injectable()
export class GetSystemSimRequestsSummaryUseCase {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(SIM_PROVISIONING_REQUEST_REPOSITORY)
    private readonly requestRepo: SimProvisioningRequestRepository,
  ) {}

  async execute(accessToken: string) {
    await ensureSystemActor(accessToken, this.tokenService, this.userRepository, {
      forbiddenMessage: 'You are not permitted to view SIM provisioning requests',
    });

    const requests = await this.requestRepo.findAll();
    const now = new Date();

    return {
      status: true,
      message: 'SIM provisioning summary retrieved',
      data: {
        totalRequested: requests.length,
        pendingApproval: requests.filter((r) => r.status === 'pending').length,
        approvedThisMonth: requests.filter(
          (r) => r.status === 'approved' && isSameMonth(r.approvedAt, now),
        ).length,
        rejectedThisMonth: requests.filter(
          (r) => r.status === 'rejected' && isSameMonth(r.updatedAt, now),
        ).length,
      },
    };
  }
}
