import { Inject, Injectable } from "@nestjs/common";
import { AppConfigService } from "@shared/config";
import { getFleetOrm } from "../../../shared/infrastructure/persistence/fleet-orm";
import type { DeviceQuotaReader } from "../../domain/ports/device-quota-reader.port";

/**
 * Reads the device allowance from the plan entitlements the auth service owns.
 * Same database, so this is a join rather than a network call, and it reads the
 * same `quotas` document `assertWithinQuota` enforces against.
 */
@Injectable()
export class MikroDeviceQuotaReader implements DeviceQuotaReader {
  constructor(@Inject(AppConfigService) private readonly config: AppConfigService) {}

  async findDeviceLimit(tenantId: string): Promise<number | null> {
    const orm = await getFleetOrm(this.config.db);
    const rows = await orm.em.getConnection().execute<Array<{ devices: unknown }>>(
      `select e.quotas->'devices' as devices
         from system_tenant_onboardings o
         join plan_entitlements e
           on e.plan_code = o.subscription->>'planCode'
        where o.tenant_id = ?
        limit 1`,
      [tenantId],
    );

    return toLimit(rows[0]?.devices);
  }
}

/** Used on the in-memory backend, where no plan data exists. */
@Injectable()
export class UnlimitedDeviceQuotaReader implements DeviceQuotaReader {
  async findDeviceLimit(): Promise<number | null> {
    return null;
  }
}

// The quota document stores either a number or the string "unlimited". No row,
// no plan, and an explicitly unlimited plan all mean do not restrict.
function toLimit(raw: unknown): number | null {
  if (raw === undefined || raw === null) return null;
  const value = typeof raw === "string" ? raw.replace(/^"|"$/g, "") : raw;
  if (value === "unlimited") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
