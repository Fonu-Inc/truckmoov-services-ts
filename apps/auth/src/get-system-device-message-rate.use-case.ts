import { Inject, Injectable } from '@nestjs/common';
import { TOKEN_SERVICE, USER_REPOSITORY } from './contexts/auth/session';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import { ensureSystemActor } from './system-authz';
import { TrackingGateClient } from './tracking-gate.client';

@Injectable()
export class GetSystemDeviceMessageRateUseCase {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(TrackingGateClient) private readonly tracking: TrackingGateClient,
  ) {}

  async execute(accessToken: string) {
    await ensureSystemActor(accessToken, this.tokenService, this.userRepository, {
      forbiddenMessage: 'You are not permitted to view device message rates',
    });
    const report = await this.tracking.messageRate();
    const data = report
      ? {
          gateReachable: true,
          countsSince: report.countsSince,
          lastHour: report.lastHour,
          hours: report.hours,
        }
      : { gateReachable: false, countsSince: null, lastHour: null, hours: [] };
    return { status: true, message: 'success', data: { ...data, generatedAt: new Date().toISOString() } };
  }
}
