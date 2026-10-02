import { Inject, Injectable } from '@nestjs/common';
import { TOKEN_SERVICE, USER_REPOSITORY } from './contexts/auth/session';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import { ensureSystemActor } from './system-authz';
import { TrackingGateClient, type QuarantinedDevice } from './tracking-gate.client';

export type UnrecognisedDevices = {
  trackingReachable: boolean;
  devices: QuarantinedDevice[];
};

@Injectable()
export class ListUnrecognisedDevicesUseCase {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(TrackingGateClient) private readonly tracking: TrackingGateClient,
  ) {}

  async execute(accessToken: string) {
    await ensureSystemActor(accessToken, this.tokenService, this.userRepository, {
      forbiddenMessage: 'You are not permitted to view device inventory',
    });
    const devices = await this.tracking.quarantinedDevices();
    const data: UnrecognisedDevices = devices
      ? { trackingReachable: true, devices }
      : { trackingReachable: false, devices: [] };
    return { status: true, message: 'success', data: { ...data, generatedAt: new Date().toISOString() } };
  }
}
