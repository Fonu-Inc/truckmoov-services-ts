/** A fleet device bound to one of an installer's jobs, with the tenant that holds it. */
export type InstallerScopeEntry = {
  tenantId: string;
  orderId: string;
  jobNumber: string;
  deviceId: string;
};

export interface InstallerDeviceScopePort {
  /** The installer's devices, as auth decides them. Null when auth cannot be asked. */
  forUser(userId: string): Promise<InstallerScopeEntry[] | null>;
}

export const INSTALLER_DEVICE_SCOPE = Symbol("INSTALLER_DEVICE_SCOPE");
