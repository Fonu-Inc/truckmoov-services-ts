import {
  FLEET_ASSET_STATUSES,
  type FleetAssetStatus,
  isFleetAssetStatus,
} from "../../../shared/domain/fleet-status";

export type VehicleGpsDevice = {
  imei: string;
  manufacturer: string;
  model: string;
  firmwareVersion: string;
  installedAt: string;
};

export type FleetVehicleType = "truck" | "van" | "trailer";

export const FLEET_FUEL_TYPES = ["diesel", "petrol", "ev", "hybrid"] as const;
export type FleetFuelType = typeof FLEET_FUEL_TYPES[number];

export function isFleetFuelType(value: unknown): value is FleetFuelType {
  return typeof value === "string" && (FLEET_FUEL_TYPES as readonly string[]).includes(value);
}

import {
  assertCapacityWithinRange,
  capacityPallets,
  capacityVolumeM3,
  capacityWeightKg,
  normalizeCapacityUnit,
  type VehicleCapacityUnit,
} from "../vehicle-capacity";

export type VehiclePrimitives = VehicleProps & {
  capacityUnit: VehicleCapacityUnit;
  // Derived on read from capacity + unit rather than stored, so the two can
  // never disagree. Null where the unit does not measure that thing.
  capacityWeightKg: number | null;
  capacityVolumeM3: number | null;
  capacityPallets: number | null;
};

export type VehicleProps = {
  id: string;
  plateNumber: string;
  registrationNumber?: string;
  vin: string | null;
  make: string | null;
  model: string;
  year: number | null;
  type: FleetVehicleType | null;
  fuelType?: FleetFuelType | null;
  capacity: number | null;
  capacityUnit?: VehicleCapacityUnit | null;
  tenantId: string;
  status: FleetAssetStatus;
  assignedDriverId: string | null;
  ownerOperatorId: string | null;
  gpsDevice: VehicleGpsDevice | null;
  createdAt?: string;
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
    if (props.vin !== null && props.vin !== undefined) {
      const normalizedVin = props.vin.trim().toUpperCase();
      if (normalizedVin.length !== 17) {
        throw new Error("vin must be 17 characters");
      }
      props = { ...props, vin: normalizedVin };
    }
    if (props.make !== null && props.make !== undefined && !props.make.trim()) {
      throw new Error("make cannot be empty");
    }
    if (props.year !== null && props.year !== undefined) {
      const maxYear = new Date().getFullYear() + 1;
      if (!Number.isInteger(props.year) || props.year < 1990 || props.year > maxYear) {
        throw new Error(`year must be between 1990 and ${maxYear}`);
      }
    }
    if (props.type !== null && props.type !== undefined && !["truck", "van", "trailer"].includes(props.type)) {
      throw new Error("type must be one of: truck, van, trailer");
    }
    if (props.fuelType !== null && props.fuelType !== undefined && !isFleetFuelType(props.fuelType)) {
      throw new Error(`fuelType must be one of: ${FLEET_FUEL_TYPES.join(", ")}`);
    }
    const capacityUnit = normalizeCapacityUnit(props.capacityUnit);
    if (props.capacity !== null && props.capacity !== undefined) {
      assertCapacityWithinRange(props.capacity, capacityUnit);
    }
    if (props.gpsDevice) {
      const imei = props.gpsDevice.imei.trim();
      if (!/^\d{15}$/.test(imei)) {
        throw new Error("gps device imei must be 15 digits");
      }
      if (!props.gpsDevice.manufacturer.trim()) {
        throw new Error("gps device manufacturer is required");
      }
      if (!props.gpsDevice.model.trim()) {
        throw new Error("gps device model is required");
      }
      if (!props.gpsDevice.firmwareVersion.trim()) {
        throw new Error("gps device firmwareVersion is required");
      }
    }

    return new Vehicle({
      ...props,
      plateNumber: props.plateNumber.trim().toUpperCase(),
      registrationNumber: props.plateNumber.trim().toUpperCase(),
      vin: props.vin?.trim().toUpperCase() || null,
      make: props.make?.trim() || null,
      model: props.model.trim(),
      year: props.year ?? null,
      type: props.type ?? null,
      fuelType: props.fuelType ?? null,
      capacity: props.capacity ?? null,
      capacityUnit,
      tenantId: props.tenantId.trim(),
      status: props.status,
      assignedDriverId: props.assignedDriverId?.trim() || null,
      ownerOperatorId: props.ownerOperatorId?.trim() || null,
      gpsDevice: props.gpsDevice
        ? {
            // Keep the fleet aggregate aligned to the same GPS device vocabulary used in the admin UI.
            imei: props.gpsDevice.imei.trim(),
            manufacturer: props.gpsDevice.manufacturer.trim(),
            model: props.gpsDevice.model.trim(),
            firmwareVersion: props.gpsDevice.firmwareVersion.trim(),
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

  get registrationNumber() {
    // Expose the UI field name without duplicating storage for the same identifier.
    return this.props.plateNumber;
  }

  get vin() {
    return this.props.vin;
  }

  get make() {
    return this.props.make;
  }

  get model() {
    return this.props.model;
  }

  get year() {
    return this.props.year;
  }

  get type() {
    return this.props.type;
  }

  get fuelType() {
    return this.props.fuelType;
  }

  get capacity() {
    return this.props.capacity;
  }

  get capacityUnit(): VehicleCapacityUnit {
    return normalizeCapacityUnit(this.props.capacityUnit);
  }

  /** Mass units resolved to kilograms; null for volume and pallet capacities. */
  get capacityWeightKg() {
    return capacityWeightKg(this.capacity, this.capacityUnit);
  }

  get capacityVolumeM3() {
    return capacityVolumeM3(this.capacity, this.capacityUnit);
  }

  get capacityPallets() {
    return capacityPallets(this.capacity, this.capacityUnit);
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

  get ownerOperatorId() {
    return this.props.ownerOperatorId;
  }

  get gpsDevice() {
    return this.props.gpsDevice;
  }

  get createdAt() {
    return this.props.createdAt;
  }

  update(values: {
    plateNumber?: string;
    vin?: string | null;
    make?: string | null;
    model?: string;
    year?: number | null;
    type?: FleetVehicleType | null;
    fuelType?: FleetFuelType | null;
    capacity?: number | null;
    capacityUnit?: VehicleCapacityUnit | null;
    tenantId?: string;
    status?: FleetAssetStatus;
  }): Vehicle {
    return Vehicle.create({
      id: this.id,
      plateNumber: values.plateNumber ?? this.plateNumber,
      vin: values.vin === undefined ? this.vin : values.vin,
      make: values.make === undefined ? this.make : values.make,
      model: values.model ?? this.model,
      year: values.year === undefined ? this.year : values.year,
      type: values.type === undefined ? this.type : values.type,
      fuelType: values.fuelType === undefined ? this.fuelType : values.fuelType,
      capacity: values.capacity === undefined ? this.capacity : values.capacity,
      capacityUnit: values.capacityUnit === undefined ? this.capacityUnit : values.capacityUnit,
      tenantId: values.tenantId ?? this.tenantId,
      status: values.status ?? this.status,
      assignedDriverId: this.assignedDriverId,
      ownerOperatorId: this.ownerOperatorId,
      gpsDevice: this.gpsDevice,
      createdAt: this.createdAt,
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

  assignOwnerOperator(ownerOperatorId: string): Vehicle {
    return Vehicle.create({
      ...this.toPrimitives(),
      ownerOperatorId,
    });
  }

  unassignOwnerOperator(): Vehicle {
    return Vehicle.create({
      ...this.toPrimitives(),
      ownerOperatorId: null,
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

  toPrimitives(): VehiclePrimitives {
    return {
      id: this.id,
      plateNumber: this.plateNumber,
      registrationNumber: this.registrationNumber,
      vin: this.vin,
      make: this.make,
      model: this.model,
      year: this.year,
      type: this.type,
      fuelType: this.fuelType,
      capacity: this.capacity,
      capacityUnit: this.capacityUnit,
      capacityWeightKg: this.capacityWeightKg,
      capacityVolumeM3: this.capacityVolumeM3,
      capacityPallets: this.capacityPallets,
      tenantId: this.tenantId,
      status: this.status,
      assignedDriverId: this.assignedDriverId,
      ownerOperatorId: this.ownerOperatorId,
      gpsDevice: this.gpsDevice ? { ...this.gpsDevice } : null,
      createdAt: this.createdAt,
    };
  }
}
