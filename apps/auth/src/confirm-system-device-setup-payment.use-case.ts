import { Inject, Injectable } from '@nestjs/common';
import { canTransitionSetupRequest } from '@shared/devices';
import { TOKEN_SERVICE, USER_REPOSITORY } from './contexts/auth/session';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
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

export class DeviceSetupRequestNotAwaitingPaymentError extends Error {
  constructor(readonly currentStatus: string) {
    super(`Only a device request awaiting payment can have its payment confirmed. This one is ${currentStatus}`);
  }
}

/**
 * A platform admin confirms the tenant has paid. Manual until charges are
 * built: nothing here checks an amount.
 */
@Injectable()
export class ConfirmSystemDeviceSetupPaymentUseCase {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(DEVICE_SETUP_REQUEST_REPOSITORY)
    private readonly repo: DeviceSetupRequestRepository,
  ) {}

  async execute(accessToken: string, requestId: string, note?: string) {
    await ensureSystemActor(accessToken, this.tokenService, this.userRepository, {
      allowedRoles: SYSTEM_MUTATOR_ROLES,
      forbiddenMessage: 'You are not permitted to confirm device request payments',
    });

    const request = await this.repo.findById(requestId);
    if (!request) throw new DeviceSetupRequestNotFoundError(requestId);
    if (!canTransitionSetupRequest(request.status, 'ready_for_installation')) {
      throw new DeviceSetupRequestNotAwaitingPaymentError(request.status);
    }

    await this.repo.advance({
      id: requestId,
      status: 'ready_for_installation',
      timeline: appendSetupRequestTimeline(request, 'ready_for_installation', note?.trim() || null),
    });
    const updated = await this.repo.findById(requestId);
    if (!updated) throw new DeviceSetupRequestNotFoundError(requestId);

    return {
      status: true,
      message: 'Device request payment confirmed',
      data: serializeDeviceSetupRequest(updated),
    };
  }
}
