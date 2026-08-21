import { Inject, Injectable, Logger } from "@nestjs/common";
import { AppConfigService } from "@shared/config";
import { getFleetOrm } from "../../../shared/infrastructure/persistence/fleet-orm";
import type { VehicleQuotaReader } from "../../domain/ports/vehicle-quota-reader.port";

/**
 * Reads the plan allowance owned by the auth service. Both services share one
 * database, so this is a plain join rather than a network call: if it fails the
 * database is unreachable, in which case the vehicle write fails anyway.
 */
@Injectable()
export class MikroVehicleQuotaReader implements VehicleQuotaReader {
  private readonly logger = new Logger(MikroVehicleQuotaReader.name);

  constructor(@Inject(AppConfigService) private readonly config: AppConfigService) {}

  async findActiveVehicleLimit(tenantId: string): Promise<number | null> {
    const orm = await getFleetOrm(this.config.db);
    const rows = await orm.em.getConnection().execute<Array<{ max_active_vehicles: number | null }>>(
      `select p.max_active_vehicles
         from system_tenant_onboardings o
         join system_subscription_plans p
           on p.code = o.subscription->>'planCode'
        where o.tenant_id = ?
        limit 1`,
      [tenantId],
    );

    const limit = rows[0]?.max_active_vehicles;
    // No onboarding row, no plan, or an explicitly unlimited plan all mean
    // "do not restrict". Only a real number caps the tenant.
    if (limit === undefined || limit === null) return null;
    return Number(limit);
  }
}

/** Used when the service runs on the in-memory backend, where no plan data exists. */
@Injectable()
export class UnlimitedVehicleQuotaReader implements VehicleQuotaReader {
  async findActiveVehicleLimit(): Promise<number | null> {
    return null;
  }
}
