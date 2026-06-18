import { Inject, Injectable } from '@nestjs/common';
import { TOKEN_SERVICE, USER_REPOSITORY, ForbiddenError } from './contexts/auth/session';
import { resolveActorUser } from './contexts/auth/session/application/use-cases/support/resolve-actor-user';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import { SIM_REPOSITORY, type SimRepository } from './sim.repository';
import { buildExport } from './export.helper';

@Injectable()
export class ExportTenantSimsUseCase {
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
      format?: 'csv' | 'xlsx';
    },
  ) {
    const actor = await resolveActorUser(accessToken, this.tokenService, this.userRepository);
    if (actor.tenantId === 'system') throw new ForbiddenError('System actors cannot export tenant SIMs');

    const { items } = await this.simRepository.findAll({
      ...filters,
      tenantId: actor.tenantId,
      limit: 10000,
    });

    const headers = [
      'ID',
      'ICCID',
      'IMSI',
      'Mobile Number',
      'Operator',
      'Status',
      'Data Limit (GB)',
      'Data Used (GB)',
      'Monthly Rental (NGN)',
      'Assigned Device ID',
      'Created At',
    ];

    const rows = items.map((s) => [
      s.id,
      s.iccid,
      s.imsi ?? '',
      s.msisdn ?? '',
      s.carrier,
      s.status,
      s.dataLimitMb / 1024,
      s.dataUsageMb / 1024,
      s.monthlyCostNgn,
      s.deviceId ?? '',
      s.createdAt.toISOString(),
    ]);

    return buildExport(filters?.format ?? 'csv', headers, rows, 'SIM Inventory');
  }
}
