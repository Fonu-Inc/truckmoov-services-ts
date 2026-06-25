export const DEVICE_SETUP_REQUEST_STATUSES = [
  "pending_review",
  "in_progress",
  "provisioned",
  "assigned",
  "cancelled",
] as const;

export type DeviceSetupRequestStatus = (typeof DEVICE_SETUP_REQUEST_STATUSES)[number];

export const VALID_SETUP_REQUEST_TRANSITIONS: Record<DeviceSetupRequestStatus, DeviceSetupRequestStatus[]> = {
  pending_review: ["in_progress", "cancelled"],
  in_progress: ["provisioned", "cancelled"],
  provisioned: ["assigned", "cancelled"],
  assigned: [],
  cancelled: [],
};

export const TRACKER_TYPES = ["hardwired", "obd", "asset"] as const;
export type TrackerType = (typeof TRACKER_TYPES)[number];

export type SetupRequestTimelineEntry = {
  status: DeviceSetupRequestStatus;
  at: string;
  note?: string | null;
};

export type DeviceSetupRequestProps = {
  id: string;
  tenantId: string;
  requestedByUserId?: string | null;
  organisationName?: string | null;
  requestingEmail?: string | null;
  manufacturer: string;
  model?: string | null;
  trackerType: TrackerType;
  quantity: number;
  simRequired: boolean;
  carrierId?: string | null;
  planType?: string | null;
  bundleId?: string | null;
  vehicleId?: string | null;
  state?: string | null;
  city?: string | null;
  preferredDate?: string | null;
  preferredTime?: string | null;
  useCase: string;
  notes?: string | null;
  status: DeviceSetupRequestStatus;
  timeline: SetupRequestTimelineEntry[];
  createdAt: string;
  updatedAt: string;
};

export type CreateDeviceSetupRequestInput = Omit<
  DeviceSetupRequestProps,
  "status" | "timeline" | "createdAt" | "updatedAt" | "quantity" | "simRequired"
> & {
  quantity?: number;
  simRequired?: boolean;
};

function nowIso(): string {
  return new Date().toISOString();
}

export class DeviceSetupRequest {
  private constructor(private readonly props: DeviceSetupRequestProps) {}

  static create(input: CreateDeviceSetupRequestInput): DeviceSetupRequest {
    const manufacturer = input.manufacturer?.trim();
    const useCase = input.useCase?.trim();
    if (!input.id) throw new Error("setup request id is required");
    if (!input.tenantId) throw new Error("tenantId is required");
    if (!manufacturer) throw new Error("manufacturer is required");
    if (!useCase) throw new Error("useCase is required");
    if (!TRACKER_TYPES.includes(input.trackerType)) {
      throw new Error(`invalid trackerType: ${input.trackerType}`);
    }
    const quantity = input.quantity ?? 1;
    if (!Number.isInteger(quantity) || quantity < 1) {
      throw new Error("quantity must be a positive integer");
    }
    const simRequired = input.simRequired ?? false;
    if (simRequired && !input.carrierId) {
      throw new Error("carrierId is required when a SIM is requested");
    }

    const at = nowIso();
    return new DeviceSetupRequest({
      id: input.id,
      tenantId: input.tenantId,
      requestedByUserId: input.requestedByUserId ?? null,
      organisationName: input.organisationName ?? null,
      requestingEmail: input.requestingEmail ?? null,
      manufacturer,
      model: input.model?.trim() || null,
      trackerType: input.trackerType,
      quantity,
      simRequired,
      carrierId: input.carrierId ?? null,
      planType: input.planType?.trim() || null,
      bundleId: input.bundleId ?? null,
      vehicleId: input.vehicleId ?? null,
      state: input.state?.trim() || null,
      city: input.city?.trim() || null,
      preferredDate: input.preferredDate ?? null,
      preferredTime: input.preferredTime ?? null,
      useCase,
      notes: input.notes?.trim() || null,
      status: "pending_review",
      timeline: [{ status: "pending_review", at }],
      createdAt: at,
      updatedAt: at,
    });
  }

  static fromPrimitives(props: DeviceSetupRequestProps): DeviceSetupRequest {
    return new DeviceSetupRequest(props);
  }

  get id(): string {
    return this.props.id;
  }

  get tenantId(): string {
    return this.props.tenantId;
  }

  get status(): DeviceSetupRequestStatus {
    return this.props.status;
  }

  canTransitionTo(next: DeviceSetupRequestStatus): boolean {
    return VALID_SETUP_REQUEST_TRANSITIONS[this.props.status].includes(next);
  }

  transitionTo(next: DeviceSetupRequestStatus, note?: string): DeviceSetupRequest {
    if (next === this.props.status) return this;
    if (!this.canTransitionTo(next)) {
      throw new Error(`invalid setup-request transition: ${this.props.status} -> ${next}`);
    }
    const at = nowIso();
    return new DeviceSetupRequest({
      ...this.props,
      status: next,
      timeline: [...this.props.timeline, { status: next, at, note: note ?? null }],
      updatedAt: at,
    });
  }

  toPrimitives(): DeviceSetupRequestProps {
    return { ...this.props, timeline: this.props.timeline.map((t) => ({ ...t })) };
  }
}
