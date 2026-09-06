export const DEVICE_SETUP_REQUEST_STATUSES = [
  "pending_review",
  // The platform's decision on the request. Both are terminal for the tenant:
  // a rejected request is not retried in place, a new one is submitted.
  "approved",
  "rejected",
  "in_progress",
  "provisioned",
  "assigned",
  "cancelled",
] as const;

export type DeviceSetupRequestStatus = (typeof DEVICE_SETUP_REQUEST_STATUSES)[number];

export const VALID_SETUP_REQUEST_TRANSITIONS: Record<DeviceSetupRequestStatus, DeviceSetupRequestStatus[]> = {
  pending_review: ["approved", "rejected", "cancelled"],
  approved: ["in_progress", "cancelled"],
  rejected: [],
  in_progress: ["provisioned", "cancelled"],
  provisioned: ["assigned", "cancelled"],
  assigned: [],
  cancelled: [],
};

/** Requests waiting on a platform decision. */
export const SETUP_REQUEST_PENDING_STATUSES: readonly DeviceSetupRequestStatus[] = [
  "pending_review",
];

/** Requests the platform has said yes to, wherever provisioning has reached. */
export const SETUP_REQUEST_APPROVED_STATUSES: readonly DeviceSetupRequestStatus[] = [
  "approved",
  "in_progress",
  "provisioned",
  "assigned",
];

export const TRACKER_TYPES = ["hardwired", "obd", "asset"] as const;
export type TrackerType = (typeof TRACKER_TYPES)[number];

/**
 * Labels live with the values because the wording is part of the contract: an
 * installer reading "asset" and a customer reading "Battery / Portable" must be
 * talking about the same hardware.
 */
export const TRACKER_TYPE_OPTIONS: ReadonlyArray<{
  value: TrackerType;
  label: string;
  description: string;
}> = [
  {
    value: "obd",
    label: "OBD-II Plug & Play",
    description: "Plugs into the vehicle diagnostic port. No wiring, moved between vehicles easily.",
  },
  {
    value: "hardwired",
    label: "Hardwired",
    description: "Wired to the vehicle supply by an installer. Tamper resistant, needs a fitting appointment.",
  },
  {
    value: "asset",
    label: "Battery / Portable",
    description: "Self-powered. For trailers and assets with no supply to draw from.",
  },
];

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
  /** Platform admin working the request, set from the platform queue. */
  assignedTo?: string | null;
  /** Platform admin who approved or rejected, and why. */
  decidedBy?: string | null;
  decidedAt?: string | null;
  decisionReason?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreateDeviceSetupRequestInput = Omit<
  DeviceSetupRequestProps,
  | "status"
  | "timeline"
  | "createdAt"
  | "updatedAt"
  | "quantity"
  | "simRequired"
  | "assignedTo"
  | "decidedBy"
  | "decidedAt"
  | "decisionReason"
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
      assignedTo: null,
      decidedBy: null,
      decidedAt: null,
      decisionReason: null,
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

  get tenantIdValue(): string {
    return this.props.tenantId;
  }

  /**
   * The platform's decision. Recorded separately from a plain transition
   * because the queue has to say who decided and why, and a rejection with no
   * reason is not a decision the tenant can act on.
   */
  decide(
    next: Extract<DeviceSetupRequestStatus, "approved" | "rejected">,
    decidedBy: string,
    reason?: string | null,
  ): DeviceSetupRequest {
    if (!this.canTransitionTo(next)) {
      throw new Error(`invalid setup-request transition: ${this.props.status} -> ${next}`);
    }
    const trimmed = reason?.trim() || null;
    if (next === "rejected" && !trimmed) {
      throw new Error("a rejection needs a reason");
    }

    const at = nowIso();
    return new DeviceSetupRequest({
      ...this.props,
      status: next,
      timeline: [...this.props.timeline, { status: next, at, note: trimmed }],
      decidedBy,
      decidedAt: at,
      decisionReason: trimmed,
      updatedAt: at,
    });
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
