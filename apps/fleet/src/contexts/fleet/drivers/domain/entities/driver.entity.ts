export const FLEET_DRIVER_STATUSES = [
  "active",
  "available",
  "offline",
  "suspended",
] as const;

export const DRIVER_STATUS_INPUTS = [...FLEET_DRIVER_STATUSES, "inactive"] as const;

export const DRIVER_COMMUNICATION_PREFERENCES = [
  "whatsapp",
  "sms",
  "email",
  "voice",
] as const;

export type FleetDriverStatus = (typeof FLEET_DRIVER_STATUSES)[number];
export type DriverStatusInput = (typeof DRIVER_STATUS_INPUTS)[number];
export type DriverCommunicationPreference =
  (typeof DRIVER_COMMUNICATION_PREFERENCES)[number];

export function isFleetDriverStatus(value: string): value is FleetDriverStatus {
  return FLEET_DRIVER_STATUSES.includes(value as FleetDriverStatus);
}

export function isDriverCommunicationPreference(
  value: string,
): value is DriverCommunicationPreference {
  return DRIVER_COMMUNICATION_PREFERENCES.includes(
    value as DriverCommunicationPreference,
  );
}

export function normalizeDriverStatus(
  value?: DriverStatusInput | null,
): FleetDriverStatus | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  return value === "inactive" ? "offline" : value;
}

export function isDriverUnavailableStatus(status: FleetDriverStatus) {
  return status === "offline" || status === "suspended";
}

export type DriverContactChannels = {
  whatsappNumber: string | null;
  smsNumber: string | null;
  voiceNumber: string | null;
};

export type DriverProps = {
  id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  licenseNumber: string;
  licenseExpiryDate?: string | null;
  tenantId: string;
  status: FleetDriverStatus;
  communicationPreference?: DriverCommunicationPreference;
  assignedVehicleId: string | null;
  contactChannels: DriverContactChannels;
  // Stored, not derived on read: the score is computed from deliveries whose
  // traffic conditions are no longer observable once the job is over.
  performanceScore?: number | null;
  performanceJobsScored?: number | null;
  performanceScoredAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type DriverPrimitives = DriverProps & {
  firstName: string;
  lastName: string;
};

function splitDriverName(name: string) {
  const [firstName = "", ...rest] = name.trim().split(/\s+/);
  return {
    firstName,
    lastName: rest.join(" "),
  };
}

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
    if (!isFleetDriverStatus(props.status)) {
      throw new Error(
        `status must be one of: ${FLEET_DRIVER_STATUSES.join(", ")}`,
      );
    }
    const communicationPreference = props.communicationPreference ?? "whatsapp";
    if (!isDriverCommunicationPreference(communicationPreference)) {
      throw new Error(
        `communicationPreference must be one of: ${DRIVER_COMMUNICATION_PREFERENCES.join(", ")}`,
      );
    }
    if (props.licenseExpiryDate && Number.isNaN(Date.parse(props.licenseExpiryDate))) {
      throw new Error("licenseExpiryDate must be a valid ISO date");
    }

    return new Driver({
      ...props,
      name: props.name.trim(),
      phone: props.phone?.trim() || "",
      email: props.email?.trim() || null,
      licenseNumber: props.licenseNumber.trim().toUpperCase(),
      licenseExpiryDate: props.licenseExpiryDate?.trim() || null,
      tenantId: props.tenantId.trim(),
      status: props.status,
      communicationPreference,
      assignedVehicleId: props.assignedVehicleId?.trim() || null,
      contactChannels: {
        whatsappNumber: props.contactChannels.whatsappNumber?.trim() || null,
        smsNumber: props.contactChannels.smsNumber?.trim() || null,
        voiceNumber: props.contactChannels.voiceNumber?.trim() || null,
      },
      performanceScore: props.performanceScore ?? null,
      performanceJobsScored: props.performanceJobsScored ?? null,
      performanceScoredAt: props.performanceScoredAt ?? null,
      createdAt: props.createdAt ?? new Date().toISOString(),
      updatedAt: props.updatedAt ?? new Date().toISOString(),
    });
  }

  get id() {
    return this.props.id;
  }

  get name() {
    return this.props.name;
  }

  get firstName() {
    // The aggregate stores a canonical display name and derives split-name fields for the UI contract.
    return splitDriverName(this.name).firstName;
  }

  get lastName() {
    return splitDriverName(this.name).lastName;
  }

  get phone() {
    return this.props.phone ?? "";
  }

  get email() {
    return this.props.email ?? null;
  }

  get licenseNumber() {
    return this.props.licenseNumber;
  }

  get licenseExpiryDate() {
    return this.props.licenseExpiryDate ?? null;
  }

  get tenantId() {
    return this.props.tenantId;
  }

  get status() {
    return this.props.status;
  }

  get communicationPreference() {
    return this.props.communicationPreference ?? "whatsapp";
  }

  get assignedVehicleId() {
    return this.props.assignedVehicleId;
  }

  get contactChannels() {
    return this.props.contactChannels;
  }

  get performanceScore() {
    return this.props.performanceScore ?? null;
  }

  get performanceJobsScored() {
    return this.props.performanceJobsScored ?? null;
  }

  get performanceScoredAt() {
    return this.props.performanceScoredAt ?? null;
  }

  withPerformance(score: number, jobsScored: number, scoredAt: string): Driver {
    return Driver.create({
      ...this.toPrimitives(),
      performanceScore: score,
      performanceJobsScored: jobsScored,
      performanceScoredAt: scoredAt,
    });
  }

  get createdAt() {
    return this.props.createdAt ?? new Date().toISOString();
  }

  get updatedAt() {
    return this.props.updatedAt ?? this.createdAt;
  }

  update(values: {
    name?: string;
    phone?: string;
    email?: string | null;
    licenseNumber?: string;
    licenseExpiryDate?: string | null;
    tenantId?: string;
    status?: FleetDriverStatus;
    communicationPreference?: DriverCommunicationPreference;
  }): Driver {
    return Driver.create({
      id: this.id,
      name: values.name ?? this.name,
      phone: values.phone ?? this.phone,
      email: values.email === undefined ? this.email : values.email,
      licenseNumber: values.licenseNumber ?? this.licenseNumber,
      licenseExpiryDate:
        values.licenseExpiryDate === undefined
          ? this.licenseExpiryDate
          : values.licenseExpiryDate,
      tenantId: values.tenantId ?? this.tenantId,
      status: values.status ?? this.status,
      communicationPreference:
        values.communicationPreference ?? this.communicationPreference,
      assignedVehicleId: this.assignedVehicleId,
      contactChannels: this.contactChannels,
      createdAt: this.createdAt,
      updatedAt: new Date().toISOString(),
    });
  }

  assignVehicle(vehicleId: string): Driver {
    return Driver.create({
      ...this.toPrimitives(),
      assignedVehicleId: vehicleId,
      updatedAt: new Date().toISOString(),
    });
  }

  unassignVehicle(): Driver {
    return Driver.create({
      ...this.toPrimitives(),
      assignedVehicleId: null,
      updatedAt: new Date().toISOString(),
    });
  }

  setStatus(status: FleetDriverStatus): Driver {
    return Driver.create({
      ...this.toPrimitives(),
      status,
      assignedVehicleId: isDriverUnavailableStatus(status)
        ? null
        : this.assignedVehicleId,
      updatedAt: new Date().toISOString(),
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
      updatedAt: new Date().toISOString(),
    });
  }

  toPrimitives(): DriverPrimitives {
    return {
      id: this.id,
      name: this.name,
      firstName: this.firstName,
      lastName: this.lastName,
      phone: this.phone,
      email: this.email,
      licenseNumber: this.licenseNumber,
      licenseExpiryDate: this.licenseExpiryDate,
      tenantId: this.tenantId,
      status: this.status,
      communicationPreference: this.communicationPreference,
      assignedVehicleId: this.assignedVehicleId,
      contactChannels: { ...this.contactChannels },
      performanceScore: this.performanceScore,
      performanceJobsScored: this.performanceJobsScored,
      performanceScoredAt: this.performanceScoredAt,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}
