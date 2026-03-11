import {
  FLEET_ASSET_STATUSES,
  type FleetAssetStatus,
  isFleetAssetStatus,
} from "../../../shared/domain/fleet-status";

export type VehicleGpsDevice = {
  deviceId: string;
  provider: string;
  serialNumber: string;
  installedAt: string;
};

export type VehicleProps = {
  id: string;
  plateNumber: string;
  model: string;
  tenantId: string;
  status: FleetAssetStatus;
  assignedDriverId: string | null;
  gpsDevice: VehicleGpsDevice | null;
};

export class Vehicle {
  private constructor(private readonly props: VehicleProps) {}

  static create(props: VehicleProps): Vehicle {
    if (!props.plateNumber.trim()) {
      throw new Error("plateNumber is required");
    }
    if (!props.model.trim()) {
      throw new Error("model is required");
    }
    if (!props.tenantId.trim()) {
      throw new Error("tenantId is required");
    }
    if (!isFleetAssetStatus(props.status)) {
      throw new Error(
        `status must be one of: ${FLEET_ASSET_STATUSES.join(", ")}`,
      );
    }

    return new Vehicle({
      ...props,
      plateNumber: props.plateNumber.trim().toUpperCase(),
      model: props.model.trim(),
      tenantId: props.tenantId.trim(),
      status: props.status,
      assignedDriverId: props.assignedDriverId?.trim() || null,
      gpsDevice: props.gpsDevice
        ? {
            deviceId: props.gpsDevice.deviceId.trim(),
            provider: props.gpsDevice.provider.trim(),
            serialNumber: props.gpsDevice.serialNumber.trim(),
            installedAt: props.gpsDevice.installedAt,
          }
        : null,
    });
  }

  get id() {
    return this.props.id;
  }

  get plateNumber() {
    return this.props.plateNumber;
  }

  get model() {
    return this.props.model;
  }

  get tenantId() {
    return this.props.tenantId;
  }

  get status() {
    return this.props.status;
  }

  get assignedDriverId() {
    return this.props.assignedDriverId;
  }

  get gpsDevice() {
    return this.props.gpsDevice;
  }

  update(values: {
    plateNumber?: string;
    model?: string;
    tenantId?: string;
    status?: FleetAssetStatus;
  }): Vehicle {
    return Vehicle.create({
      id: this.id,
      plateNumber: values.plateNumber ?? this.plateNumber,
      model: values.model ?? this.model,
      tenantId: values.tenantId ?? this.tenantId,
      status: values.status ?? this.status,
      assignedDriverId: this.assignedDriverId,
      gpsDevice: this.gpsDevice,
    });
  }

  assignDriver(driverId: string): Vehicle {
    return Vehicle.create({
      ...this.toPrimitives(),
      assignedDriverId: driverId,
    });
  }

  unassignDriver(): Vehicle {
    return Vehicle.create({
      ...this.toPrimitives(),
      assignedDriverId: null,
    });
  }

  setStatus(status: FleetAssetStatus): Vehicle {
    return Vehicle.create({
      ...this.toPrimitives(),
      status,
      assignedDriverId: status === "inactive" ? null : this.assignedDriverId,
    });
  }

  registerGpsDevice(gpsDevice: VehicleGpsDevice): Vehicle {
    return Vehicle.create({
      ...this.toPrimitives(),
      gpsDevice,
    });
  }

  clearGpsDevice(): Vehicle {
    return Vehicle.create({
      ...this.toPrimitives(),
      gpsDevice: null,
    });
  }

  toPrimitives(): VehicleProps {
    return {
      id: this.id,
      plateNumber: this.plateNumber,
      model: this.model,
      tenantId: this.tenantId,
      status: this.status,
      assignedDriverId: this.assignedDriverId,
      gpsDevice: this.gpsDevice ? { ...this.gpsDevice } : null,
    };
  }
}
