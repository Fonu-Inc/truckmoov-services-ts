import { Inject, Injectable } from '@nestjs/common';
import { AppConfigService } from '@shared/config';
import { TOKEN_SERVICE, USER_REPOSITORY } from './contexts/auth/session';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import { getAuthOrm } from './contexts/auth/session/infrastructure/persistence/auth-orm';
import { ensureSystemActor } from './system-authz';
import { periodDays, type SnapshotPeriod } from './system-snapshot-period';

type ManufacturerRow = { manufacturer?: string | null; count?: number | string | null };
type ExistsRow = { exists?: boolean | number | string };

const UNKNOWN_MANUFACTURER = 'Unknown';

@Injectable()
export class GetSystemDeviceManufacturersUseCase {
  constructor(
    @Inject(AppConfigService) private readonly config: AppConfigService,
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
  ) {}

  async execute(accessToken: string, period: SnapshotPeriod = 'all') {
    await ensureSystemActor(accessToken, this.tokenService, this.userRepository, {
      forbiddenMessage: 'You are not permitted to view device summary data',
    });
    const manufacturers = this.config.persistence.backend === 'in-memory' ? [] : await this.countByManufacturer(periodDays(period));
    return {
      status: true,
      message: 'success',
      data: { period, manufacturers, generatedAt: new Date().toISOString() },
    };
  }

  private async countByManufacturer(addedWithinDays: number | null) {
    const orm = await getAuthOrm(this.config.db);
    const connection = orm.em.getConnection();
    const exists = await connection.execute<ExistsRow[]>(
      "select exists(select 1 from information_schema.tables where table_schema = 'public' and table_name = ?) as exists",
      ['fleet_devices'],
    );
    if (!this.toBoolean(exists[0]?.exists)) return [];

    const rows = await connection.execute<ManufacturerRow[]>(
      `select coalesce(nullif(trim(manufacturer), ''), ?) as manufacturer, count(*)::int as count
         from fleet_devices
        where (?::int is null or created_at >= now() - make_interval(days => ?::int))
        group by 1
        order by count desc, manufacturer asc`,
      [UNKNOWN_MANUFACTURER, addedWithinDays, addedWithinDays],
    );
    return rows.map((row) => ({
      manufacturer: String(row.manufacturer ?? UNKNOWN_MANUFACTURER),
      count: Number(row.count ?? 0) || 0,
    }));
  }

  private toBoolean(value: unknown) {
    return value === true || value === 1 || value === '1' || value === 't' || value === 'true';
  }
}
