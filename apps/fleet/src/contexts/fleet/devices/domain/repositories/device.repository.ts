import type {
  Device,
  DeviceLifecycleStatus,
  DeviceStatus,
  DeviceVerificationStatus,
} from "../entities/device.entity";

export type DeviceFilters = {
  tenantId: string;
  query?: string;
  manufacturer?: string;
  status?: DeviceStatus;
  lifecycleStatus?: DeviceLifecycleStatus;
  lifecycleStatusIn?: DeviceLifecycleStatus[];
  verificationStatus?: DeviceVerificationStatus;
  verifiedAfter?: Date;
  assigned?: boolean;
  vehicleId?: string;
  lastSeenAfter?: Date;
  lastSeenIsNull?: boolean;
};

export interface DeviceRepository {
  save(device: Device): Promise<void>;
  /**
   * Moves a stock device only while it is still as `before` read it: held by the
   * same tenant, unfitted, unheld and in the same lifecycle state, so a
   * concurrent claim, suspension or hold is never overwritten.
   */
  claimStockDevice(before: Device, moved: Device): Promise<boolean>;
  /** Which of these IMEIs any device already holds, whatever tenant or lifecycle state. */
  findExistingImeis(imeis: string[]): Promise<Set<string>>;
  /**
   * Inserts new devices in one statement, falling back to one by one when a
   * concurrent insert collides on (tenant, IMEI). Returns how many were stored;
   * a collision is skipped, never an error.
   */
  insertMany(devices: Device[]): Promise<number>;
  /** Saves only while the stored device is still waiting, so one pod wins each verification outcome. */
  saveIfWaitingForVerification(device: Device): Promise<boolean>;
  findAll(filters: DeviceFilters): Promise<Device[]>;
  findById(id: string, tenantId: string): Promise<Device | null>;
  /** The named devices this tenant holds; ids held elsewhere are left out. */
  findByIds(tenantId: string, ids: string[]): Promise<Device[]>;
  /**
   * A device by id alone, whatever tenant holds it. Only the platform calls
   * this: an administrator suspending a device does not know, and should not
   * have to supply, which tenant it belongs to.
   */
  findByIdAcrossTenants(id: string): Promise<Device | null>;
  /** Every device on the platform. Only platform-wide sweeps call this. */
  findAllAcrossTenants(): Promise<Device[]>;
  findByImei(imei: string, tenantId: string): Promise<Device | null>;
  /** Devices that still carry an IMEI, by id, across tenants. Only tracking's identity snapshot calls this. */
  listLiveAfter(afterId: string | null, limit: number): Promise<Device[]>;
  /** The live (not decommissioned) device holding this IMEI, whatever tenant. */
  findLiveByImei(imei: string): Promise<Device | null>;
  findByVehicleId(vehicleId: string, tenantId: string): Promise<Device | null>;
  deleteById(id: string, tenantId: string): Promise<void>;
  /**
   * Devices whose waiting window has closed, across every tenant. The sweep
   * that fails them runs platform-wide, so this deliberately takes no tenant.
   */
  findAwaitingVerificationPastDeadline(now: Date, limit: number): Promise<Device[]>;
  /**
   * Devices whose Traccar registration failed and whose next attempt is due,
   * across every tenant. Decommissioned devices are left out.
   */
  findProvisionRetryDue(now: Date, limit: number): Promise<Device[]>;
}

export const DEVICE_REPOSITORY = Symbol("DEVICE_REPOSITORY");
