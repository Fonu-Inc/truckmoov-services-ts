import type { Alert, AlertStatus } from "./alert.entity";

export type AlertFilters = {
  status?: AlertStatus;
  type?: string;
  vehicleId?: string;
  jobId?: string;
};

export interface AlertRepository {
  save(alert: Alert): Promise<void>;
  findById(tenantId: string, id: string): Promise<Alert | null>;
  findAll(tenantId: string, filters?: AlertFilters): Promise<Alert[]>;
  /** Open alerts raised before the cutoff, across every tenant. Only the escalation sweep calls this. */
  findOpenTriggeredBefore(cutoff: Date, limit: number): Promise<Alert[]>;
}

export const ALERT_REPOSITORY = Symbol("ALERT_REPOSITORY");
