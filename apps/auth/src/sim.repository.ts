export const SIM_STATUSES = [
  'registered',
  'active',
  'assigned',
  'unassigned',
  'suspended',
  'deactivated',
] as const;

export const SIM_CARRIERS = ['MTN', 'Airtel', 'Glo', '9mobile'] as const;

export const SIM_PLANS = [
  'iot_basic',
  'iot_premium',
  'data_only',
  'data_sms',
  'data_sms_voice',
] as const;

export type SimStatus = (typeof SIM_STATUSES)[number];
export type SimCarrier = (typeof SIM_CARRIERS)[number];
export type SimPlan = (typeof SIM_PLANS)[number];

export type StoredSim = {
  id: string;
  iccid: string;
  imsi: string | null;
  msisdn: string | null;
  carrier: string;
  plan: string;
  status: string;
  tenantId: string | null;
  deviceId: string | null;
  deviceName: string | null;
  deviceImei: string | null;
  deviceType: string | null;
  vehicleId: string | null;
  suspensionReason: string | null;
  suspensionCause?: string | null;
  preSuspensionStatus?: string | null;
  notes: string | null;
  dataUsageMb: number;
  dataLimitMb: number;
  smsUsage: number;
  smsLimit: number;
  monthlyCostNgn: number;
  activationDate: Date | null;
  expiryDate: Date | null;
  lastActivity: Date | null;
  signalStrength: number | null;
  networkType: string | null;
  roaming: boolean;
  fonuSimId: string | null;
  fonuStatus: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type SimFilters = {
  status?: string;
  carrier?: string;
  tenantId?: string;
  search?: string;
  operators?: string[];
  page?: number;
  limit?: number;
};

export type TenantSimCount = { tenantId: string; activeSims: number };

export interface SimRepository {
  findAll(filters?: SimFilters): Promise<{ items: StoredSim[]; total: number }>;
  findById(id: string): Promise<StoredSim | null>;
  findByDeviceIds(deviceIds: string[]): Promise<StoredSim[]>;
  findByMsisdns(tenantId: string, msisdns: string[]): Promise<StoredSim[]>;
  save(sim: StoredSim): Promise<void>;
  delete(id: string): Promise<void>;
  countByStatus(): Promise<Record<string, number>>;
  countByCarrier(): Promise<Record<string, number>>;
  countUnassigned(): Promise<number>;
  countActiveByTenant(): Promise<TenantSimCount[]>;
}

export const SIM_REPOSITORY = Symbol('SIM_REPOSITORY');
