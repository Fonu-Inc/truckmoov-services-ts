import {
  FLEET_ASSET_STATUSES,
  type FleetAssetStatus,
  isFleetAssetStatus,
} from "../../../shared/domain/fleet-status";

export type DriverContactChannels = {
  whatsappNumber: string | null;
  smsNumber: string | null;
  voiceNumber: string | null;
};

export type DriverProps = {
  id: string;
  name: string;
  licenseNumber: string;
  tenantId: string;
  status: FleetAssetStatus;
  assignedVehicleId: string | null;
  contactChannels: DriverContactChannels;
};

export class Driver {
  private constructor(private readonly props: DriverProps) {}

  static create(props: DriverProps): Driver {
    if (!props.name.trim()) {
      throw new Error("name is required");
    }
    if (!props.licenseNumber.trim()) {
      throw new Error("licenseNumber is required");
    }
    if (!props.tenantId.trim()) {
      throw new Error("tenantId is required");
    }
    if (!isFleetAssetStatus(props.status)) {
      throw new Error(
        `status must be one of: ${FLEET_ASSET_STATUSES.join(", ")}`,
      );
    }

    return new Driver({
      ...props,
      name: props.name.trim(),
      licenseNumber: props.licenseNumber.trim().toUpperCase(),
      tenantId: props.tenantId.trim(),
      status: props.status,
      assignedVehicleId: props.assignedVehicleId?.trim() || null,
      contactChannels: {
        whatsappNumber: props.contactChannels.whatsappNumber?.trim() || null,
        smsNumber: props.contactChannels.smsNumber?.trim() || null,
        voiceNumber: props.contactChannels.voiceNumber?.trim() || null,
      },
    });
  }

  get id() {
    return this.props.id;
  }

  get name() {
    return this.props.name;
  }

  get licenseNumber() {
    return this.props.licenseNumber;
  }

  get tenantId() {
    return this.props.tenantId;
  }

  get status() {
    return this.props.status;
  }

  get assignedVehicleId() {
    return this.props.assignedVehicleId;
  }

  get contactChannels() {
    return this.props.contactChannels;
  }

  update(values: {
    name?: string;
    licenseNumber?: string;
    tenantId?: string;
    status?: FleetAssetStatus;
  }): Driver {
    return Driver.create({
      id: this.id,
      name: values.name ?? this.name,
      licenseNumber: values.licenseNumber ?? this.licenseNumber,
      tenantId: values.tenantId ?? this.tenantId,
      status: values.status ?? this.status,
      assignedVehicleId: this.assignedVehicleId,
      contactChannels: this.contactChannels,
    });
  }

  assignVehicle(vehicleId: string): Driver {
    return Driver.create({
      ...this.toPrimitives(),
      assignedVehicleId: vehicleId,
    });
  }

  unassignVehicle(): Driver {
    return Driver.create({
      ...this.toPrimitives(),
      assignedVehicleId: null,
    });
  }

  setStatus(status: FleetAssetStatus): Driver {
    return Driver.create({
      ...this.toPrimitives(),
      status,
      assignedVehicleId: status === "inactive" ? null : this.assignedVehicleId,
    });
  }

  updateContactChannels(values: Partial<DriverContactChannels>): Driver {
    return Driver.create({
      ...this.toPrimitives(),
      contactChannels: {
        whatsappNumber:
          values.whatsappNumber === undefined
            ? this.contactChannels.whatsappNumber
            : values.whatsappNumber,
        smsNumber:
          values.smsNumber === undefined
            ? this.contactChannels.smsNumber
            : values.smsNumber,
        voiceNumber:
          values.voiceNumber === undefined
            ? this.contactChannels.voiceNumber
            : values.voiceNumber,
      },
    });
  }

  toPrimitives(): DriverProps {
    return {
      id: this.id,
      name: this.name,
      licenseNumber: this.licenseNumber,
      tenantId: this.tenantId,
      status: this.status,
      assignedVehicleId: this.assignedVehicleId,
      contactChannels: { ...this.contactChannels },
    };
  }
}
