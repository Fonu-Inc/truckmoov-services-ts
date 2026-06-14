import { Inject, Injectable } from '@nestjs/common';
import { TOKEN_SERVICE, USER_REPOSITORY } from './contexts/auth/session';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import { ensureSystemActor } from './system-authz';
import {
  DEVICE_SETUP_REQUEST_REPOSITORY,
  type DeviceSetupRequestFilters,
  type DeviceSetupRequestRepository,
} from './device-setup-request.repository';

@Injectable()
export class ListSystemDeviceSetupRequestsUseCase {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(DEVICE_SETUP_REQUEST_REPOSITORY) private readonly repo: DeviceSetupRequestRepository,
  ) {}

  async execute(accessToken: string, filters?: DeviceSetupRequestFilters) {
    await ensureSystemActor(accessToken, this.tokenService, this.userRepository, {
      forbiddenMessage: 'You are not permitted to view device setup requests',
    });
    const requests = await this.repo.findAll(filters);
    return {
      status: true,
      message: 'Device setup requests retrieved',
      data: {
        total: requests.length,
        requests: requests.map((r) => ({
          ...r,
          createdAt: r.createdAt.toISOString(),
          updatedAt: r.updatedAt.toISOString(),
        })),
      },
    };
  }
}
