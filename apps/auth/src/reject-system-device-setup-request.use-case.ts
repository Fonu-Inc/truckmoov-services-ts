import { Inject, Injectable } from '@nestjs/common';
import { TOKEN_SERVICE, USER_REPOSITORY } from './contexts/auth/session';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import { ensureSystemActor, SYSTEM_MUTATOR_ROLES } from './system-authz';
import {
  DEVICE_SETUP_REQUEST_REPOSITORY,
  type DeviceSetupRequestRepository,
} from './device-setup-request.repository';
import {
  DeviceSetupRequestNotFoundError,
  serializeDeviceSetupRequest,
} from './get-system-device-setup-request.use-case';

@Injectable()
export class RejectSystemDeviceSetupRequestUseCase {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(DEVICE_SETUP_REQUEST_REPOSITORY)
    private readonly repo: DeviceSetupRequestRepository,
  ) {}

  async execute(accessToken: string, requestId: string, reason: string) {
    await ensureSystemActor(accessToken, this.tokenService, this.userRepository, {
      allowedRoles: SYSTEM_MUTATOR_ROLES,
      forbiddenMessage: 'You are not permitted to reject device setup requests',
    });

    const request = await this.repo.findById(requestId);
    if (!request) throw new DeviceSetupRequestNotFoundError(requestId);

    request.status = 'rejected';
    request.rejectedReason = reason;
    request.updatedAt = new Date();
    await this.repo.save(request);

    return {
      status: true,
      message: 'Device setup request rejected',
      data: serializeDeviceSetupRequest(request),
    };
  }
}
