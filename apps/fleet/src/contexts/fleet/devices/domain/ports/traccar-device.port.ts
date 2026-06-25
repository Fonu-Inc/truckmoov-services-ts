export type TraccarRegisterInput = {
  imei: string;
  name: string;
};

export type TraccarRegisterResult = {
  traccarDeviceId: string;
};

/**
 * Provisions fleet devices into Traccar keyed on uniqueId = IMEI so incoming
 * Teltonika codec traffic can be associated with a known device.
 */
export interface TraccarDeviceProvisioner {
  register(input: TraccarRegisterInput): Promise<TraccarRegisterResult | null>;
  deregister(traccarDeviceId: string): Promise<void>;
}

export const TRACCAR_DEVICE_PROVISIONER = Symbol("TRACCAR_DEVICE_PROVISIONER");
