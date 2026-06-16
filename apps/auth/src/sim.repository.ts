export const SIM_STATUSES = [
  'registered',
  'active',
  'assigned',
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

export interface SimRepository {
  findAll(filters?: {
    status?: string;
    carrier?: string;
    tenantId?: string;
    search?: string;
  }): Promise<StoredSim[]>;
  findById(id: string): Promise<StoredSim | null>;
  save(sim: StoredSim): Promise<void>;
  countByStatus(): Promise<Record<string, number>>;
  countByCarrier(): Promise<Record<string, number>>;
  countUnassigned(): Promise<number>;
}

export const SIM_REPOSITORY = Symbol('SIM_REPOSITORY');
