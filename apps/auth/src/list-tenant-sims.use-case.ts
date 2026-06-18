import { Inject, Injectable } from '@nestjs/common';
import { TOKEN_SERVICE, USER_REPOSITORY, ForbiddenError } from './contexts/auth/session';
import { resolveActorUser } from './contexts/auth/session/application/use-cases/support/resolve-actor-user';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import { SIM_REPOSITORY, type SimRepository, type StoredSim } from './sim.repository';

export class SimNotFoundError extends Error {}

function mapSimToResponse(s: StoredSim) {
  return {
    id: s.id,
    iccid: s.iccid,
    imsi: s.imsi,
    mobileNumber: s.msisdn,
    operator: s.carrier,
    status: s.status,
    simType: 'iot',
    dataLimitGb: s.dataLimitMb / 1024,
    dataUsedGb: s.dataUsageMb / 1024,
    monthlyRentalNaira: s.monthlyCostNgn,
    assignedDevice: s.deviceId
      ? {
          id: s.deviceId,
          name: s.deviceName ?? '',
          type: s.deviceType ?? '',
          imei: s.deviceImei ?? '',
          vehicleId: s.vehicleId ?? null,
        }
      : null,
  };
}

@Injectable()
export class ListTenantSimsUseCase {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(SIM_REPOSITORY) private readonly simRepository: SimRepository,
  ) {}

  async execute(
    accessToken: string,
    filters?: {
      search?: string;
      status?: string;
      operators?: string[];
      page?: number;
      limit?: number;
    },
  ) {
    const actor = await resolveActorUser(accessToken, this.tokenService, this.userRepository);
    if (actor.tenantId === 'system') throw new ForbiddenError('System actors cannot access tenant SIMs');

    const { items, total } = await this.simRepository.findAll({
      ...filters,
      tenantId: actor.tenantId,
    });

    return {
      status: true,
      message: 'success',
      data: {
        items: items.map(mapSimToResponse),
        total,
        page: filters?.page ?? 1,
        limit: filters?.limit ?? 50,
      },
    };
  }
}
