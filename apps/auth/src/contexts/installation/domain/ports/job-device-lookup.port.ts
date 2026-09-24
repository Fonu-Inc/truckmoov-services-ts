/** A fleet device as the job details screen shows it. */
export type JobDevice = {
  id: string;
  name: string | null;
  imei: string;
  manufacturer: string;
  model: string;
  status: string;
  statusLabel: string;
  deviceType: string | null;
};

/**
 * Fleet devices by id, read from the fleet service within one tenant, so a
 * device another tenant holds is simply not returned.
 *
 * Null means fleet could not be asked, which is not the same as the devices
 * not existing.
 */
export interface JobDeviceLookup {
  forTenant(tenantId: string, deviceIds: string[]): Promise<Map<string, JobDevice> | null>;
}

export const JOB_DEVICE_LOOKUP = Symbol('JOB_DEVICE_LOOKUP');
