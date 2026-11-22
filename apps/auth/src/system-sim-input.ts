import { randomUUID } from 'node:crypto';
import type { StoredSim } from './sim.repository';

export const DEFAULT_IMPORT_CARRIER = 'MTN';

export type NewSystemSimInput = {
  iccid: string;
  msisdn: string;
  imsi?: string | null;
  carrier?: string | null;
  plan?: string;
  dataLimitMb?: number;
  smsLimit?: number;
};

/** Columns match the rows POST /system/sims/import takes. */
export function systemSimImportTemplate(): { csv: string; filename: string } {
  return {
    csv: 'iccid,msisdn,imsi,carrier\n8923411012345678901,+2348031234567,621301234567890,MTN\n',
    filename: 'system-sim-import-template.csv',
  };
}

export { DuplicateSimIccidError } from './sim.repository';

export class SimInUseError extends Error {
  constructor() {
    super('SIM is assigned to a tenant or device; return it to the pool before deleting');
  }
}

const ICCID_PATTERN = /^[0-9A-Za-z]{18,20}$/;
const MSISDN_PATTERN = /^\+\d{7,15}$/;
const IMSI_PATTERN = /^\d{10,15}$/;
const CARRIER_MAX = 64;

export function cleanText(value: string | null | undefined): string {
  return (value ?? '').trim();
}

export function invalidIccid(value: string): string | null {
  return ICCID_PATTERN.test(cleanText(value)) ? null : 'ICCID must be 18 to 20 letters or digits';
}

export function invalidMsisdn(value: string): string | null {
  return MSISDN_PATTERN.test(cleanText(value)) ? null : 'Phone number must start with + and have 7 to 15 digits';
}

export function invalidImsi(value: string | null | undefined): string | null {
  const imsi = cleanText(value);
  return !imsi || IMSI_PATTERN.test(imsi) ? null : 'IMSI must be 10 to 15 digits';
}

export function invalidCarrier(value: string | null | undefined): string | null {
  return cleanText(value).length > CARRIER_MAX ? `Carrier must be at most ${CARRIER_MAX} characters` : null;
}

export function invalidSimFieldReason(input: NewSystemSimInput): string | null {
  return (
    invalidIccid(input.iccid) ??
    invalidMsisdn(input.msisdn) ??
    invalidImsi(input.imsi) ??
    invalidCarrier(input.carrier)
  );
}

export function newUnassignedSim(input: NewSystemSimInput): StoredSim {
  const now = new Date();
  return {
    id: randomUUID(),
    iccid: cleanText(input.iccid),
    imsi: cleanText(input.imsi) || null,
    msisdn: cleanText(input.msisdn),
    carrier: cleanText(input.carrier) || DEFAULT_IMPORT_CARRIER,
    plan: input.plan ?? 'iot_basic',
    status: 'unassigned',
    tenantId: null,
    deviceId: null,
    deviceName: null,
    deviceImei: null,
    deviceType: null,
    vehicleId: null,
    suspensionReason: null,
    suspensionCause: null,
    preSuspensionStatus: null,
    notes: null,
    dataUsageMb: 0,
    dataLimitMb: input.dataLimitMb ?? 0,
    smsUsage: 0,
    smsLimit: input.smsLimit ?? 0,
    monthlyCostNgn: 0,
    activationDate: null,
    expiryDate: null,
    lastActivity: null,
    signalStrength: null,
    networkType: null,
    roaming: false,
    fonuSimId: null,
    fonuStatus: null,
    createdAt: now,
    updatedAt: now,
  };
}
