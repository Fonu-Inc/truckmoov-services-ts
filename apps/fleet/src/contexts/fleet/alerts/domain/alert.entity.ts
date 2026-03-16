export type AlertStatus = "open" | "acknowledged" | "resolved" | "escalated";
export type AlertSeverity = "low" | "medium" | "high" | "critical";

export type AlertProps = {
  id: string;
  tenantId: string;
  type: string;
  severity: AlertSeverity;
  status: AlertStatus;
  vehicleId: string | null;
  jobId: string | null;
  details: Record<string, unknown>;
  triggeredAt: Date;
  acknowledgedAt: Date | null;
  resolvedAt: Date | null;
  escalatedAt: Date | null;
  acknowledgedBy: string | null;
  resolvedBy: string | null;
};

export class Alert {
  private constructor(private readonly props: AlertProps) {}

  static create(props: AlertProps): Alert {
    if (!props.id.trim()) throw new Error("id is required");
    if (!props.tenantId.trim()) throw new Error("tenantId is required");
    if (!props.type.trim()) throw new Error("type is required");
    return new Alert(props);
  }

  acknowledge(by: string, at = new Date()): Alert {
    return Alert.create({ ...this.props, status: "acknowledged", acknowledgedAt: at, acknowledgedBy: by });
  }

  resolve(by: string, at = new Date()): Alert {
    return Alert.create({ ...this.props, status: "resolved", resolvedAt: at, resolvedBy: by });
  }

  escalate(at = new Date()): Alert {
    return Alert.create({ ...this.props, status: "escalated", escalatedAt: at });
  }

  get id() { return this.props.id; }
  get tenantId() { return this.props.tenantId; }
  get type() { return this.props.type; }
  get severity() { return this.props.severity; }
  get status() { return this.props.status; }
  get vehicleId() { return this.props.vehicleId; }
  get jobId() { return this.props.jobId; }
  get details() { return this.props.details; }
  get triggeredAt() { return this.props.triggeredAt; }
  get acknowledgedAt() { return this.props.acknowledgedAt; }
  get resolvedAt() { return this.props.resolvedAt; }
  get escalatedAt() { return this.props.escalatedAt; }
  get acknowledgedBy() { return this.props.acknowledgedBy; }
  get resolvedBy() { return this.props.resolvedBy; }

  toPrimitives(): AlertProps {
    return { ...this.props };
  }
}
