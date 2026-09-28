import { Inject, Injectable } from '@nestjs/common';
import { AppConfigService } from '@shared/config';
import { getAuthOrm } from '@auth/session/infrastructure/persistence/auth-orm';

type ExistsRow = { exists?: boolean | number | string };
type CountRow = { count?: number | string };

export type DeviceInventoryAvailability = {
  /** False locally before the shared fleet inventory exists. */
  tracked: boolean;
  availableQuantity: number;
};

/**
 * The public onboarding flow needs only a count, never device serials or the
 * wider warehouse inventory. This deliberately keeps that information out of
 * the browser while using the same authoritative `fleet_devices` lifecycle
 * state as the platform inventory screen.
 */
@Injectable()
export class OnboardingDeviceInventoryService {
  constructor(@Inject(AppConfigService) private readonly config: AppConfigService) {}

  async availability(): Promise<DeviceInventoryAvailability> {
    // In-memory mode has no shared warehouse. Do not turn local/test onboarding
    // into a fake stock-out; durable environments always perform the check.
    if (this.config.persistence.backend === 'in-memory') {
      return { tracked: false, availableQuantity: Number.MAX_SAFE_INTEGER };
    }

    const orm = await getAuthOrm(this.config.db);
    const connection = orm.em.getConnection();
    const [exists] = await connection.execute<ExistsRow[]>(
      "select exists(select 1 from information_schema.tables where table_schema = 'public' and table_name = ?) as exists",
      ['fleet_devices'],
    );
    if (!this.toBoolean(exists?.exists)) {
      return { tracked: false, availableQuantity: Number.MAX_SAFE_INTEGER };
    }

    const [row] = await connection.execute<CountRow[]>(
      "select count(*)::int as count from fleet_devices where lifecycle_status = 'assignable'",
    );
    return { tracked: true, availableQuantity: Math.max(0, Number(row?.count ?? 0) || 0) };
  }

  private toBoolean(value: unknown): boolean {
    return value === true || value === 1 || value === '1' || value === 't' || value === 'true';
  }
}
