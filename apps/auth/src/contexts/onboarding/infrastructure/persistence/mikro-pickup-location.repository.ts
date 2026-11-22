import { Inject, Injectable } from '@nestjs/common';
import { AppConfigService } from '@shared/config';
import { getAuthOrm } from '@auth/session/infrastructure/persistence/auth-orm';
import type { PickupLocation, PickupLocationRepository } from '@auth/onboarding/domain/pickup-location.repository';

type Row = Record<string, unknown>;

function toLocation(row: Row): PickupLocation {
  return {
    id: String(row.id),
    state: String(row.state),
    area: String(row.area),
    name: String(row.name),
    address: row.address == null ? null : String(row.address),
    isDemo: Boolean(row.is_demo),
  };
}

@Injectable()
export class MikroPickupLocationRepository implements PickupLocationRepository {
  constructor(@Inject(AppConfigService) private readonly config: AppConfigService) {}

  async listActive(): Promise<PickupLocation[]> {
    const rows = await (await this.connection()).execute<Row[]>(
      `select * from pickup_locations where active order by state, area, position, name`,
    );
    return rows.map(toLocation);
  }

  async findActiveById(id: string): Promise<PickupLocation | null> {
    const rows = await (await this.connection()).execute<Row[]>(
      `select * from pickup_locations where id = ? and active limit 1`,
      [id],
    );
    return rows[0] ? toLocation(rows[0]) : null;
  }

  private async connection() {
    return (await getAuthOrm(this.config.db)).em.fork().getConnection();
  }
}
