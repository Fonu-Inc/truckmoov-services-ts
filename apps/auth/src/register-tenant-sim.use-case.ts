import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { TOKEN_SERVICE, USER_REPOSITORY, ForbiddenError } from './contexts/auth/session';
import { resolveActorUser } from './contexts/auth/session/application/use-cases/support/resolve-actor-user';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import { SIM_REPOSITORY, type SimRepository } from './sim.repository';

@Injectable()
export class RegisterTenantSimUseCase {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(SIM_REPOSITORY) private readonly simRepository: SimRepository,
  ) {}

  async execute(
    accessToken: string,
    payload: {
      iccid: string;
      imsi?: string;
      mobileNumber: string;
      operator: string;
      dataLimitGb: number;
      monthlyRentalNaira: number;
      simType?: string;
    },
  ) {
    const actor = await resolveActorUser(accessToken, this.tokenService, this.userRepository);
    if (actor.tenantId === 'system') throw new ForbiddenError('System actors cannot register SIMs');

    const now = new Date();
    const id = randomUUID();

    await this.simRepository.save({
      id,
      iccid: payload.iccid,
      imsi: payload.imsi ?? null,
      msisdn: payload.mobileNumber,
      carrier: payload.operator,
      plan: payload.simType ?? 'iot_basic',
      status: 'registered',
      tenantId: actor.tenantId,
      deviceId: null,
      deviceName: null,
      deviceImei: null,
      deviceType: null,
      vehicleId: null,
      suspensionReason: null,
      notes: null,
      dataUsageMb: 0,
      dataLimitMb: payload.dataLimitGb * 1024,
      smsUsage: 0,
      smsLimit: 0,
      monthlyCostNgn: payload.monthlyRentalNaira,
      activationDate: null,
      expiryDate: null,
      lastActivity: null,
      signalStrength: null,
      networkType: null,
      roaming: false,
      fonuSimId: null,
      fonuStatus: null,
      createdAt: now,
      updatedAt: now,
    });

    return { status: true, message: 'success', data: { id } };
  }
}
