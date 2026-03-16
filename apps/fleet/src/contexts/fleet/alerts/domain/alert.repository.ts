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
}

export const ALERT_REPOSITORY = Symbol("ALERT_REPOSITORY");
