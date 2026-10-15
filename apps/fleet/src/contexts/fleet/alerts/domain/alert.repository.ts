import type { Alert, AlertSeverity, AlertStatus } from "./alert.entity";

export type AlertFilters = {
  status?: AlertStatus;
  type?: string;
  vehicleId?: string;
  vehicleIdIn?: string[];
  jobId?: string;
  limit?: number;
};

export type AlertCount = { status: AlertStatus; type: string; severity: AlertSeverity; count: number };

export interface AlertRepository {
  save(alert: Alert): Promise<void>;
  findById(tenantId: string, id: string): Promise<Alert | null>;
  /** Newest first by trigger time. */
  findAll(tenantId: string, filters?: AlertFilters): Promise<Alert[]>;
  countBy(tenantId: string): Promise<AlertCount[]>;
  /** Mean trigger-to-resolve time over resolved alerts; null when none are resolved. */
  meanTimeToResolveMs(tenantId: string): Promise<number | null>;
  /** Open alerts raised before the cutoff, across every tenant. Only the escalation sweep calls this. */
  findOpenTriggeredBefore(cutoff: Date, limit: number): Promise<Alert[]>;
  /** Escalates only if still open, so a concurrent acknowledgement wins; true when this call changed it. */
  escalateIfOpen(tenantId: string, id: string, at: Date): Promise<boolean>;
}

export const ALERT_REPOSITORY = Symbol("ALERT_REPOSITORY");
