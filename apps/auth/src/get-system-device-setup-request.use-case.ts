import { Inject, Injectable } from '@nestjs/common';
import { TOKEN_SERVICE, USER_REPOSITORY } from './contexts/auth/session';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import { ensureSystemActor } from './system-authz';
import {
  DEVICE_SETUP_REQUEST_REPOSITORY,
  type DeviceSetupRequestRepository,
  type StoredDeviceSetupRequest,
} from './device-setup-request.repository';

export class DeviceSetupRequestNotFoundError extends Error {
  constructor(id: string) {
    super(`Device setup request ${id} not found`);
  }
}

export function serializeDeviceSetupRequest(r: StoredDeviceSetupRequest) {
  return {
    ...r,
    preferredInstallDate: r.preferredInstallDate?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

@Injectable()
export class GetSystemDeviceSetupRequestUseCase {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(DEVICE_SETUP_REQUEST_REPOSITORY)
    private readonly repo: DeviceSetupRequestRepository,
  ) {}

  async execute(accessToken: string, requestId: string) {
    await ensureSystemActor(accessToken, this.tokenService, this.userRepository, {
      forbiddenMessage: 'You are not permitted to view device setup requests',
    });

    const request = await this.repo.findById(requestId);
    if (!request) throw new DeviceSetupRequestNotFoundError(requestId);

    return {
      status: true,
      message: 'Device setup request retrieved',
      data: serializeDeviceSetupRequest(request),
    };
  }
}
