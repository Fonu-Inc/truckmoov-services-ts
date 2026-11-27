import { Inject, Injectable } from '@nestjs/common';
import { AppConfigService } from '@shared/config';
import { tableExists } from '@shared/db';
import { SYSTEM_TENANT_ID } from '@shared/identity';
import { getAuthOrm } from '@auth/session/infrastructure/persistence/auth-orm';

type CountRow = { count?: number | string };

/** Mirrors fleet's isHealthyStock over the system tenant's devices: the one set the allocator draws from. */
const PLATFORM_STOCK_PREDICATE =
  "tenant_id = ? and vehicle_id is null and hold_cause is null and lifecycle_status not in ('faulty', 'suspended', 'decommissioned')";

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

  private async fleetDevicesExists(): Promise<boolean> {
    const connection = (await getAuthOrm(this.config.db)).em.getConnection();
    return tableExists(connection, 'fleet_devices');
  }

  async availability(): Promise<DeviceInventoryAvailability> {
    // In-memory mode has no shared warehouse. Do not turn local/test onboarding
    // into a fake stock-out; durable environments always perform the check.
    if (this.config.persistence.backend === 'in-memory') {
      return { tracked: false, availableQuantity: Number.MAX_SAFE_INTEGER };
    }

    if (!(await this.fleetDevicesExists())) {
      return { tracked: false, availableQuantity: Number.MAX_SAFE_INTEGER };
    }
    const connection = (await getAuthOrm(this.config.db)).em.getConnection();

    const [row] = await connection.execute<CountRow[]>(
      `select count(*)::int as count from fleet_devices where ${PLATFORM_STOCK_PREDICATE}`,
      [SYSTEM_TENANT_ID],
    );
    return { tracked: true, availableQuantity: Math.max(0, Number(row?.count ?? 0) || 0) };
  }

  /** Devices a tenant holds that are still in service. */
  async heldBy(tenantId: string): Promise<number> {
    if (this.config.persistence.backend === 'in-memory') return 0;

    if (!(await this.fleetDevicesExists())) return 0;
    const connection = (await getAuthOrm(this.config.db)).em.getConnection();

    const [row] = await connection.execute<CountRow[]>(
      "select count(*)::int as count from fleet_devices where tenant_id = ? and lifecycle_status <> 'decommissioned'",
      [tenantId],
    );
    return Math.max(0, Number(row?.count ?? 0) || 0);
  }
}
