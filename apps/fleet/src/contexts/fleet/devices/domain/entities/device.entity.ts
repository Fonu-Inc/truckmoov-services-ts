export {
  DEVICE_INSTALLATION_QUEUE_STATUSES,
  DEVICE_LIFECYCLE_STATUSES,
  DEVICE_PROVISION_STATUSES,
  DEVICE_STATUSES,
  deviceStatusFromLifecycle,
  isDeviceLifecycleStatus,
  isDeviceProvisionStatus,
  isDeviceStatus,
  isDeviceProtocol,
  isDeviceVerificationStatus,
  nextInstallationAction,
  protocolNeedsPort,
} from "@shared/devices";
import { FleetRuleError } from "../../../shared/domain/errors/fleet-rule.error";
import {
  DEVICE_LIFECYCLE_STATUSES,
  DEVICE_PROTOCOLS,
  DEVICE_STATUSES,
  DEVICE_VERIFICATION_STATUSES,
  deviceStatusFromLifecycle,
  isDeviceLifecycleStatus,
  isDeviceStatus,
  isDeviceProtocol,
  isDeviceVerificationStatus,
  nextInstallationAction,
  protocolNeedsPort,
  type DeviceLifecycleStatus,
  type DeviceNextAction,
  type DeviceProtocol,
  type DeviceProvisionStatus,
  type DeviceStatus,
  type DeviceVerificationStatus,
} from "@shared/devices";

export type {
  DeviceLifecycleStatus,
  DeviceNextAction,
  DeviceProtocol,
  DeviceProvisionStatus,
  DeviceStatus,
  DeviceVerificationStatus,
};


export const VALID_DEVICE_LIFECYCLE_TRANSITIONS: Record<
  DeviceLifecycleStatus,
  DeviceLifecycleStatus[]
> = {
  registered: ["config_pending", "configured"],
  config_pending: ["configured", "faulty"],
  configured: ["verified_online", "faulty"],
  verified_online: ["assignable", "faulty"],
  assignable: ["assigned", "faulty"],
  assigned: ["assignable", "faulty", "decommissioned"],
  faulty: ["config_pending", "configured", "decommissioned"],
  decommissioned: [],
};

/**
 * A device can be configured before it has been fitted and again after a
 * failed attempt. It cannot be configured once it is carrying a vehicle.
 */
const CONFIGURABLE_LIFECYCLE_STATUSES: readonly DeviceLifecycleStatus[] = [
  "registered",
  "config_pending",
  "configured",
  "faulty",
];

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
  protocol?: DeviceProtocol | null;
  port?: number | null;
  configuredAt?: string | null;
  verificationStatus?: DeviceVerificationStatus | null;
  verificationDeadline?: string | null;
  verificationError?: string | null;
  verifiedAt?: string | null;
  traccarDeviceId?: string | null;
  provisionStatus?: DeviceProvisionStatus;
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
    if (props.protocol && !isDeviceProtocol(props.protocol)) {
      throw new Error(`protocol must be one of: ${DEVICE_PROTOCOLS.join(", ")}`);
    }
    if (props.port !== null && props.port !== undefined) {
      if (!Number.isInteger(props.port) || props.port < 1 || props.port > 65535) {
        throw new Error("port must be between 1 and 65535");
      }
    }
    if (
      props.verificationStatus &&
      !isDeviceVerificationStatus(props.verificationStatus)
    ) {
      throw new Error(
        `verificationStatus must be one of: ${DEVICE_VERIFICATION_STATUSES.join(", ")}`,
      );
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
      protocol: props.protocol ?? null,
      port: props.port ?? null,
      configuredAt: props.configuredAt ?? null,
      verificationStatus: props.verificationStatus ?? null,
      verificationDeadline: props.verificationDeadline ?? null,
      verificationError: props.verificationError ?? null,
      verifiedAt: props.verifiedAt ?? null,
      traccarDeviceId: props.traccarDeviceId ?? null,
      provisionStatus: props.provisionStatus ?? "pending",
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

  get protocol(): DeviceProtocol | null {
    return this.props.protocol ?? null;
  }

  get port(): number | null {
    return this.props.port ?? null;
  }

  get configuredAt(): string | null {
    return this.props.configuredAt ?? null;
  }

  get verificationStatus(): DeviceVerificationStatus | null {
    return this.props.verificationStatus ?? null;
  }

  get verificationDeadline(): string | null {
    return this.props.verificationDeadline ?? null;
  }

  get verificationError(): string | null {
    return this.props.verificationError ?? null;
  }

  get verifiedAt(): string | null {
    return this.props.verifiedAt ?? null;
  }

  get nextAction(): DeviceNextAction {
    return nextInstallationAction(this.lifecycleStatus, this.verificationStatus);
  }

  get traccarDeviceId() {
    return this.props.traccarDeviceId ?? null;
  }

  get provisionStatus(): DeviceProvisionStatus {
    return this.props.provisionStatus ?? "pending";
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

  withProvisioning(values: {
    traccarDeviceId?: string | null;
    provisionStatus: DeviceProvisionStatus;
  }): Device {
    return Device.create({
      ...this.toPrimitives(),
      traccarDeviceId:
        values.traccarDeviceId === undefined ? this.traccarDeviceId : values.traccarDeviceId,
      provisionStatus: values.provisionStatus,
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

  /**
   * Records that the installer programmed the device with a protocol and port.
   * The values are stored on the device, not read from the catalogue on every
   * view: the catalogue default can change later, and what matters when a
   * device will not report is what was actually programmed into it.
   */
  configure(values: {
    protocol: DeviceProtocol;
    port: number | null;
    at?: string;
  }): Device {
    if (!CONFIGURABLE_LIFECYCLE_STATUSES.includes(this.lifecycleStatus)) {
      throw new FleetRuleError(
        `device cannot be configured from ${this.lifecycleStatus}`,
      );
    }
    if (protocolNeedsPort(values.protocol) && values.port === null) {
      throw new FleetRuleError(`${values.protocol} devices need a port`);
    }

    const at = values.at ?? new Date().toISOString();
    return Device.create({
      ...this.toPrimitives(),
      lifecycleStatus: "configured",
      status: deviceStatusFromLifecycle("configured"),
      protocol: values.protocol,
      port: protocolNeedsPort(values.protocol) ? values.port : null,
      configuredAt: at,
      // A new configuration starts a new attempt. The previous outcome says
      // nothing about the settings now on the device.
      verificationStatus: null,
      verificationDeadline: null,
      verificationError: null,
      verifiedAt: null,
      updatedAt: at,
    });
  }

  /**
   * Opens the waiting window. Nothing is checked here — the device reports or
   * it does not, and the deadline is what turns silence into a failure.
   */
  beginVerification(values: { deadline: string; at?: string }): Device {
    if (this.lifecycleStatus !== "configured") {
      throw new FleetRuleError("only a configured device can be verified");
    }
    if (Number.isNaN(Date.parse(values.deadline))) {
      throw new Error("deadline must be a valid ISO date");
    }

    const at = values.at ?? new Date().toISOString();
    return Device.create({
      ...this.toPrimitives(),
      verificationStatus: "waiting",
      verificationDeadline: values.deadline,
      verificationError: null,
      updatedAt: at,
    });
  }

  /**
   * The device reported for the first time. This is the only path to
   * verified_online: a person clicking a button is not evidence that a tracker
   * is on the network.
   */
  recordFirstTelemetry(at: string): Device {
    if (this.verificationStatus !== "waiting") {
      throw new FleetRuleError("device is not waiting for verification");
    }

    return Device.create({
      ...this.toPrimitives(),
      lifecycleStatus: "verified_online",
      status: deviceStatusFromLifecycle("verified_online"),
      verificationStatus: "verified",
      verificationDeadline: null,
      verificationError: null,
      verifiedAt: at,
      lastSeen: at,
      updatedAt: at,
    });
  }

  /**
   * The attempt did not succeed. The device stays configured so the installer
   * can correct the settings and try again; only a physical fault moves it to
   * faulty, and that is a separate decision.
   */
  failVerification(reason: string, at?: string): Device {
    const failedAt = at ?? new Date().toISOString();
    return Device.create({
      ...this.toPrimitives(),
      verificationStatus: "failed",
      verificationDeadline: null,
      verificationError: reason.trim() || "verification failed",
      updatedAt: failedAt,
    });
  }

  /** True once the deadline has passed with no telemetry. */
  hasVerificationExpired(now: string): boolean {
    if (this.verificationStatus !== "waiting" || !this.verificationDeadline) {
      return false;
    }
    return Date.parse(this.verificationDeadline) <= Date.parse(now);
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
      protocol: this.protocol,
      port: this.port,
      configuredAt: this.configuredAt,
      verificationStatus: this.verificationStatus,
      verificationDeadline: this.verificationDeadline,
      verificationError: this.verificationError,
      verifiedAt: this.verifiedAt,
      traccarDeviceId: this.traccarDeviceId,
      provisionStatus: this.provisionStatus,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}
