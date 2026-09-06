import { Inject, Injectable } from '@nestjs/common';
import { TOKEN_SERVICE, USER_REPOSITORY } from './contexts/auth/session';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import { FleetFactsService } from './fleet-facts.service';
import { ensureSystemActor, SYSTEM_MUTATOR_ROLES } from './system-authz';

export class DeviceSuspensionRefusedError extends Error {
  constructor(
    readonly httpStatus: number,
    message: string,
  ) {
    super(message);
  }
}

/**
 * The platform's Suspend and Reinstate actions on the device inventory.
 *
 * Fleet owns the device and the rule, so this authorises the actor and then
 * asks fleet. Whatever fleet refuses — a device already suspended, one that has
 * been decommissioned — is passed back as it came, so the queue shows the real
 * reason rather than a generic failure.
 */
@Injectable()
export class SuspendSystemDeviceUseCase {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(FleetFactsService) private readonly fleet: FleetFactsService,
  ) {}

  async execute(accessToken: string, deviceId: string, reason?: string) {
    await ensureSystemActor(accessToken, this.tokenService, this.userRepository, {
      allowedRoles: SYSTEM_MUTATOR_ROLES,
      forbiddenMessage: 'You are not permitted to suspend devices',
    });

    const result = await this.fleet.setDeviceSuspension(deviceId, 'suspend', reason ?? null);
    if (!result.ok) throw new DeviceSuspensionRefusedError(result.status, result.message);

    return { status: true, message: 'Device suspended', data: result.device };
  }
}

@Injectable()
export class ReinstateSystemDeviceUseCase {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(FleetFactsService) private readonly fleet: FleetFactsService,
  ) {}

  async execute(accessToken: string, deviceId: string) {
    await ensureSystemActor(accessToken, this.tokenService, this.userRepository, {
      allowedRoles: SYSTEM_MUTATOR_ROLES,
      forbiddenMessage: 'You are not permitted to reinstate devices',
    });

    const result = await this.fleet.setDeviceSuspension(deviceId, 'reinstate');
    if (!result.ok) throw new DeviceSuspensionRefusedError(result.status, result.message);

    return { status: true, message: 'Device reinstated', data: result.device };
  }
}
