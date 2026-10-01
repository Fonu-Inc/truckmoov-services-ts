import { Inject, Injectable } from '@nestjs/common';
import { canTransitionSetupRequest } from '@shared/devices';
import { TOKEN_SERVICE, USER_REPOSITORY } from './contexts/auth/session';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import { InstallerNotFoundError, InstallerStateError } from './contexts/installation/domain/installer';
import {
  INSTALLER_REPOSITORY,
  type InstallerRepository,
} from './contexts/installation/domain/installer.repository';
import { ensureSystemActor, SYSTEM_MUTATOR_ROLES } from './system-authz';
import {
  appendSetupRequestTimeline,
  DEVICE_SETUP_REQUEST_REPOSITORY,
  type DeviceSetupRequestRepository,
} from './device-setup-request.repository';
import {
  DeviceSetupRequestNotFoundError,
  serializeDeviceSetupRequest,
} from './get-system-device-setup-request.use-case';

export class DeviceSetupRequestNotReadyError extends Error {
  constructor(readonly currentStatus: string) {
    super(`A device request must be ready for installation before it is assigned. This one is ${currentStatus}`);
  }
}

/** Hands a paid request to an installer, who then completes it from the installer portal. */
@Injectable()
export class AssignSystemDeviceSetupRequestUseCase {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(DEVICE_SETUP_REQUEST_REPOSITORY)
    private readonly repo: DeviceSetupRequestRepository,
    @Inject(INSTALLER_REPOSITORY) private readonly installers: InstallerRepository,
  ) {}

  async execute(accessToken: string, requestId: string, installerId: string) {
    await ensureSystemActor(accessToken, this.tokenService, this.userRepository, {
      allowedRoles: SYSTEM_MUTATOR_ROLES,
      forbiddenMessage: 'You are not permitted to assign device setup requests',
    });

    const request = await this.repo.findById(requestId);
    if (!request) throw new DeviceSetupRequestNotFoundError(requestId);
    if (!canTransitionSetupRequest(request.status, 'installation_in_progress')) {
      throw new DeviceSetupRequestNotReadyError(request.status);
    }
    await this.ensureActiveInstaller(installerId);

    await this.repo.assign(
      requestId,
      installerId,
      appendSetupRequestTimeline(request, 'installation_in_progress', null),
    );
    const updated = await this.repo.findById(requestId);
    if (!updated) throw new DeviceSetupRequestNotFoundError(requestId);

    return {
      status: true,
      message: 'Device setup request assigned',
      data: serializeDeviceSetupRequest(updated),
    };
  }

  private async ensureActiveInstaller(installerId: string): Promise<void> {
    const installer = await this.installers.findById(installerId);
    if (!installer) throw new InstallerNotFoundError();
    if (installer.status !== 'active') {
      throw new InstallerStateError(`Only an active installer can be assigned a device request. This one is ${installer.status}`);
    }
  }
}
