import { Inject, Injectable } from '@nestjs/common';
import { TOKEN_SERVICE, USER_REPOSITORY, ForbiddenError } from './contexts/auth/session';
import { resolveActorUser } from './contexts/auth/session/application/use-cases/support/resolve-actor-user';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import { SIM_REPOSITORY, type SimRepository } from './sim.repository';
import { SimNotFoundError } from './list-tenant-sims.use-case';

@Injectable()
export class GetTenantSimUseCase {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(SIM_REPOSITORY) private readonly simRepository: SimRepository,
  ) {}

  async execute(accessToken: string, simId: string) {
    const actor = await resolveActorUser(accessToken, this.tokenService, this.userRepository);
    if (actor.tenantId === 'system') throw new ForbiddenError('System actors cannot access tenant SIMs');

    const sim = await this.simRepository.findById(simId);
    if (!sim || sim.tenantId !== actor.tenantId) throw new SimNotFoundError('SIM not found');

    return {
      status: true,
      message: 'success',
      data: {
        id: sim.id,
        iccid: sim.iccid,
        imsi: sim.imsi,
        mobileNumber: sim.msisdn,
        operator: sim.carrier,
        status: sim.status,
        simType: 'iot',
        dataLimitGb: sim.dataLimitMb / 1024,
        dataUsedGb: sim.dataUsageMb / 1024,
        monthlyRentalNaira: sim.monthlyCostNgn,
        assignedDevice: sim.deviceId
          ? {
              id: sim.deviceId,
              name: sim.deviceName ?? '',
              type: sim.deviceType ?? '',
              imei: sim.deviceImei ?? '',
              vehicleId: sim.vehicleId ?? null,
            }
          : null,
        notes: sim.notes,
        createdAt: sim.createdAt.toISOString(),
        updatedAt: sim.updatedAt.toISOString(),
      },
    };
  }
}
