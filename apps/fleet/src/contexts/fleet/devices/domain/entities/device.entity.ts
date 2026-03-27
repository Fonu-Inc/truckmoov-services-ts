export const DEVICE_LIFECYCLE_STATUSES = [
  "registered",
  "config_pending",
  "configured",
  "verified_online",
  "assignable",
  "assigned",
  "faulty",
  "decommissioned",
] as const;

export const DEVICE_STATUSES = [
  "registered",
  "configured",
  "assigned",
  "active",
  "faulty",
  "decommissioned",
] as const;

export type DeviceLifecycleStatus = (typeof DEVICE_LIFECYCLE_STATUSES)[number];
export type DeviceStatus = (typeof DEVICE_STATUSES)[number];

export function isDeviceLifecycleStatus(value: string): value is DeviceLifecycleStatus {
  return DEVICE_LIFECYCLE_STATUSES.includes(value as DeviceLifecycleStatus);
}

export function isDeviceStatus(value: string): value is DeviceStatus {
  return DEVICE_STATUSES.includes(value as DeviceStatus);
}

export function deviceStatusFromLifecycle(status: DeviceLifecycleStatus): DeviceStatus {
  switch (status) {
    case "registered":
    case "config_pending":
      return "registered";
    case "configured":
      return "configured";
    case "verified_online":
    case "assignable":
      return "active";
    case "assigned":
      return "assigned";
    case "faulty":
      return "faulty";
    case "decommissioned":
      return "decommissioned";
  }
}

export const VALID_DEVICE_LIFECYCLE_TRANSITIONS: Record<
  DeviceLifecycleStatus,
  DeviceLifecycleStatus[]
> = {
  registered: ["config_pending"],
  config_pending: ["configured", "faulty"],
  configured: ["verified_online", "faulty"],
  verified_online: ["assignable", "faulty"],
  assignable: ["assigned", "faulty"],
  assigned: ["assignable", "faulty", "decommissioned"],
  faulty: ["config_pending", "decommissioned"],
  decommissioned: [],
};

export type DeviceProps = {
  id: string;
  imei: string;
  manufacturer: string;
  model: string;
  firmwareVersion: string;
  tenantId: string;
  lifecycleStatus: DeviceLifecycleStatus;
  status?: DeviceStatus;
  vehicleId: string | null;
  signalStrength: number | null;
  batteryLevel: number | null;
  lastSeen: string | null;
  assignedAt: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export class Device {
  private constructor(private readonly props: DeviceProps) {}

  static create(props: DeviceProps): Device {
    if (!props.id.trim()) {
      throw new Error("id is required");
    }
    if (!/^\d{15}$/.test(props.imei.trim())) {
      throw new Error("imei must be 15 digits");
    }
    if (!props.manufacturer.trim()) {
      throw new Error("manufacturer is required");
    }
    if (!props.model.trim()) {
      throw new Error("model is required");
    }
    if (!props.firmwareVersion.trim()) {
      throw new Error("firmwareVersion is required");
    }
    if (!props.tenantId.trim()) {
      throw new Error("tenantId is required");
    }
    if (!isDeviceLifecycleStatus(props.lifecycleStatus)) {
      throw new Error(
        `lifecycleStatus must be one of: ${DEVICE_LIFECYCLE_STATUSES.join(", ")}`,
      );
    }
    if (props.lastSeen && Number.isNaN(Date.parse(props.lastSeen))) {
      throw new Error("lastSeen must be a valid ISO date");
    }
    if (props.assignedAt && Number.isNaN(Date.parse(props.assignedAt))) {
      throw new Error("assignedAt must be a valid ISO date");
    }
    if (props.signalStrength !== null && props.signalStrength !== undefined) {
      if (props.signalStrength < 0 || props.signalStrength > 100) {
        throw new Error("signalStrength must be between 0 and 100");
      }
    }
    if (props.batteryLevel !== null && props.batteryLevel !== undefined) {
      if (props.batteryLevel < 0 || props.batteryLevel > 100) {
        throw new Error("batteryLevel must be between 0 and 100");
      }
    }

    const vehicleId = props.vehicleId?.trim() || null;
    const lifecycleStatus = props.lifecycleStatus;
    const status = props.status ?? deviceStatusFromLifecycle(lifecycleStatus);

    if (!isDeviceStatus(status)) {
      throw new Error(`status must be one of: ${DEVICE_STATUSES.join(", ")}`);
    }
    if (lifecycleStatus === "assigned" && !vehicleId) {
      throw new Error("assigned devices must have a vehicleId");
    }

    return new Device({
      ...props,
      id: props.id.trim(),
      imei: props.imei.trim(),
      manufacturer: props.manufacturer.trim(),
      model: props.model.trim(),
      firmwareVersion: props.firmwareVersion.trim(),
      tenantId: props.tenantId.trim(),
      lifecycleStatus,
      status,
      vehicleId,
      signalStrength: props.signalStrength ?? null,
      batteryLevel: props.batteryLevel ?? null,
      lastSeen: props.lastSeen ?? null,
      assignedAt: vehicleId ? (props.assignedAt ?? new Date().toISOString()) : null,
      createdAt: props.createdAt ?? new Date().toISOString(),
      updatedAt: props.updatedAt ?? new Date().toISOString(),
    });
  }

  get id() {
    return this.props.id;
  }

  get imei() {
    return this.props.imei;
  }

  get manufacturer() {
    return this.props.manufacturer;
  }

  get model() {
    return this.props.model;
  }

  get firmwareVersion() {
    return this.props.firmwareVersion;
  }

  get tenantId() {
    return this.props.tenantId;
  }

  get lifecycleStatus() {
    return this.props.lifecycleStatus;
  }

  get status() {
    return this.props.status ?? deviceStatusFromLifecycle(this.lifecycleStatus);
  }

  get vehicleId() {
    return this.props.vehicleId;
  }

  get signalStrength() {
    return this.props.signalStrength;
  }

  get batteryLevel() {
    return this.props.batteryLevel;
  }

  get lastSeen() {
    return this.props.lastSeen;
  }

  get assignedAt() {
    return this.props.assignedAt;
  }

  get createdAt() {
    return this.props.createdAt ?? new Date().toISOString();
  }

  get updatedAt() {
    return this.props.updatedAt ?? this.createdAt;
  }

  update(values: {
    imei?: string;
    manufacturer?: string;
    model?: string;
    firmwareVersion?: string;
    tenantId?: string;
    signalStrength?: number | null;
    batteryLevel?: number | null;
    lastSeen?: string | null;
  }): Device {
    return Device.create({
      ...this.toPrimitives(),
      imei: values.imei ?? this.imei,
      manufacturer: values.manufacturer ?? this.manufacturer,
      model: values.model ?? this.model,
      firmwareVersion: values.firmwareVersion ?? this.firmwareVersion,
      tenantId: values.tenantId ?? this.tenantId,
      signalStrength: values.signalStrength === undefined ? this.signalStrength : values.signalStrength,
      batteryLevel: values.batteryLevel === undefined ? this.batteryLevel : values.batteryLevel,
      lastSeen: values.lastSeen === undefined ? this.lastSeen : values.lastSeen,
      updatedAt: new Date().toISOString(),
    });
  }

  canTransitionTo(nextStatus: DeviceLifecycleStatus) {
    return VALID_DEVICE_LIFECYCLE_TRANSITIONS[this.lifecycleStatus].includes(nextStatus);
  }

  transitionTo(nextStatus: DeviceLifecycleStatus): Device {
    if (!this.canTransitionTo(nextStatus)) {
      throw new Error(
        `device cannot transition from ${this.lifecycleStatus} to ${nextStatus}`,
      );
    }

    return Device.create({
      ...this.toPrimitives(),
      lifecycleStatus: nextStatus,
      status: deviceStatusFromLifecycle(nextStatus),
      vehicleId: nextStatus === "decommissioned" ? null : this.vehicleId,
      assignedAt: nextStatus === "decommissioned" ? null : this.assignedAt,
      updatedAt: new Date().toISOString(),
    });
  }

  assignToVehicle(vehicleId: string): Device {
    if (!["verified_online", "assignable", "assigned"].includes(this.lifecycleStatus)) {
      throw new Error("device is not ready for vehicle assignment");
    }

    return this.forceAssignToVehicle(vehicleId);
  }

  forceAssignToVehicle(vehicleId: string): Device {
    return Device.create({
      ...this.toPrimitives(),
      lifecycleStatus: "assigned",
      status: deviceStatusFromLifecycle("assigned"),
      vehicleId,
      assignedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }

  unassignFromVehicle(): Device {
    return Device.create({
      ...this.toPrimitives(),
      lifecycleStatus: this.lifecycleStatus === "decommissioned" ? "decommissioned" : "assignable",
      status: this.lifecycleStatus === "decommissioned"
        ? deviceStatusFromLifecycle("decommissioned")
        : deviceStatusFromLifecycle("assignable"),
      vehicleId: null,
      assignedAt: null,
      updatedAt: new Date().toISOString(),
    });
  }

  toPrimitives(): DeviceProps {
    return {
      id: this.id,
      imei: this.imei,
      manufacturer: this.manufacturer,
      model: this.model,
      firmwareVersion: this.firmwareVersion,
      tenantId: this.tenantId,
      lifecycleStatus: this.lifecycleStatus,
      status: this.status,
      vehicleId: this.vehicleId,
      signalStrength: this.signalStrength,
      batteryLevel: this.batteryLevel,
      lastSeen: this.lastSeen,
      assignedAt: this.assignedAt,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}
