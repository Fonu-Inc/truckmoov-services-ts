import { Inject, Injectable } from "@nestjs/common";
import { AppConfigService } from "@shared/config";
import { getFleetOrm } from "./contexts/fleet/shared/infrastructure/persistence/fleet-orm";
import { computeLifecycleStatus, type StoredMaintenanceProfile } from "./maintenance-profile.repository";

export const DISPATCH_ACTIONS = ["allow", "warn", "block"] as const;
export type DispatchAction = (typeof DISPATCH_ACTIONS)[number];
export const WARN_DAYS_MIN = 1;
export const WARN_DAYS_MAX = 30;

/** How dispatch treats a vehicle whose maintenance is due or overdue, per tenant. */
export type MaintenanceSettings = {
  dispatchOverdueAction: DispatchAction;
  dispatchDueAction: DispatchAction;
  warnDaysBefore: number;
};

export const DEFAULT_MAINTENANCE_SETTINGS: MaintenanceSettings = {
  dispatchOverdueAction: "warn",
  dispatchDueAction: "allow",
  warnDaysBefore: 7,
};

export type DispatchEligibility = {
  eligible: boolean;
  blockReason: string | null;
  warnings: string[];
  overdueCount: number;
  dueCount: number;
};

export function dispatchEligibility(settings: MaintenanceSettings, profiles: StoredMaintenanceProfile[]): DispatchEligibility {
  const statuses = profiles.map((profile) => computeLifecycleStatus(profile, settings.warnDaysBefore));
  const overdueCount = statuses.filter((status) => status === "overdue").length;
  const dueCount = statuses.filter((status) => status === "due").length;
  const result: DispatchEligibility = { eligible: true, blockReason: null, warnings: [], overdueCount, dueCount };

  const apply = (action: DispatchAction, message: string) => {
    if (action === "block" && result.eligible) {
      result.eligible = false;
      result.blockReason = message;
    } else if (action === "warn") {
      result.warnings.push(message);
    }
  };
  if (overdueCount > 0) apply(settings.dispatchOverdueAction, `Vehicle has ${overdueCount} overdue maintenance item(s)`);
  if (dueCount > 0) apply(settings.dispatchDueAction, `Vehicle has ${dueCount} maintenance item(s) due`);
  return result;
}

export interface MaintenanceSettingsRepository {
  find(tenantId: string): Promise<MaintenanceSettings | null>;
  save(tenantId: string, settings: MaintenanceSettings, updatedBy: string): Promise<void>;
}

export const MAINTENANCE_SETTINGS_REPOSITORY = Symbol("MAINTENANCE_SETTINGS_REPOSITORY");

@Injectable()
export class MikroMaintenanceSettingsRepository implements MaintenanceSettingsRepository {
  constructor(@Inject(AppConfigService) private readonly config: AppConfigService) {}

  async find(tenantId: string): Promise<MaintenanceSettings | null> {
    const rows = await (await this.connection()).execute<Array<Record<string, unknown>>>(
      `select dispatch_overdue_action, dispatch_due_action, warn_days_before from fleet_maintenance_settings where tenant_id = ?`,
      [tenantId],
    );
    const row = rows[0];
    if (!row) return null;
    return {
      dispatchOverdueAction: row.dispatch_overdue_action as DispatchAction,
      dispatchDueAction: row.dispatch_due_action as DispatchAction,
      warnDaysBefore: Number(row.warn_days_before),
    };
  }

  async save(tenantId: string, settings: MaintenanceSettings, updatedBy: string): Promise<void> {
    await (await this.connection()).execute(
      `insert into fleet_maintenance_settings (tenant_id, dispatch_overdue_action, dispatch_due_action, warn_days_before, updated_by, created_at, updated_at)
       values (?, ?, ?, ?, ?, now(), now())
       on conflict (tenant_id) do update set dispatch_overdue_action = excluded.dispatch_overdue_action,
         dispatch_due_action = excluded.dispatch_due_action, warn_days_before = excluded.warn_days_before,
         updated_by = excluded.updated_by, updated_at = now()`,
      [tenantId, settings.dispatchOverdueAction, settings.dispatchDueAction, settings.warnDaysBefore, updatedBy],
      "run",
    );
  }

  private async connection() {
    return (await getFleetOrm(this.config.db)).em.fork().getConnection();
  }
}
