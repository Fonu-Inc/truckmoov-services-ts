import { Inject, Injectable } from '@nestjs/common';
import { TOKEN_SERVICE, USER_REPOSITORY } from './contexts/auth/session';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import { DeviceSuspensionRefusedError } from './suspend-system-device.use-cases';
import { ensureSystemActor, SYSTEM_MUTATOR_ROLES } from './system-authz';
import { TrackingGateClient, type QuarantineAction } from './tracking-gate.client';

const MAX_IMEI_LENGTH = 64;

const ACTION_MESSAGES: Record<QuarantineAction, string> = {
  dismiss: 'Device dismissed',
  block: 'Device blocked',
  unblock: 'Device unblocked',
};

@Injectable()
export class ManageUnrecognisedDeviceUseCase {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(TrackingGateClient) private readonly tracking: TrackingGateClient,
  ) {}

  async execute(accessToken: string, imei: string, action: QuarantineAction, reason: string) {
    const actor = await ensureSystemActor(accessToken, this.tokenService, this.userRepository, {
      allowedRoles: SYSTEM_MUTATOR_ROLES,
      forbiddenMessage: 'You are not permitted to manage unrecognised devices',
    });
    if (!imei.trim() || imei.length > MAX_IMEI_LENGTH) {
      throw new DeviceSuspensionRefusedError(400, 'That device number is not valid');
    }
    if (!reason?.trim()) throw new DeviceSuspensionRefusedError(400, 'A reason is required');

    const result = await this.tracking.actOnQuarantined(imei, action);
    if (!result.ok) throw new DeviceSuspensionRefusedError(result.status, result.message);

    const message = ACTION_MESSAGES[action];
    return { actorId: actor.id, status: true, message, data: { imei, status: result.status } };
  }
}
