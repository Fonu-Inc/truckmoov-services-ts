import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  TOKEN_SERVICE,
  USER_REPOSITORY,
  ForbiddenError,
} from './contexts/auth/session';
import { resolveActorUser } from './contexts/auth/session/application/use-cases/support/resolve-actor-user';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import { SIM_REPOSITORY, type SimRepository } from './sim.repository';

export type SimRegistrationInput = {
  iccid: string;
  mobileNumber: string;
  networkOperator: string;
};

@Injectable()
export class RegisterSimsUseCase {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(SIM_REPOSITORY) private readonly simRepository: SimRepository,
  ) {}

  async execute(accessToken: string, sims: SimRegistrationInput[]) {
    const actor = await resolveActorUser(
      accessToken,
      this.tokenService,
      this.userRepository,
    );
    if (actor.tenantId === 'system') {
      throw new ForbiddenError('System actors cannot register SIMs');
    }

    const now = new Date();
    const registered: string[] = [];

    for (const input of sims) {
      const id = randomUUID();
      await this.simRepository.save({
        id,
        iccid: input.iccid,
        imsi: null,
        msisdn: input.mobileNumber,
        carrier: input.networkOperator,
        plan: 'iot_basic',
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
        dataLimitMb: 0,
        smsUsage: 0,
        smsLimit: 0,
        monthlyCostNgn: 0,
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
      registered.push(id);
    }

    return {
      status: true,
      message: 'success',
      data: { registered: registered.length },
    };
  }
}
