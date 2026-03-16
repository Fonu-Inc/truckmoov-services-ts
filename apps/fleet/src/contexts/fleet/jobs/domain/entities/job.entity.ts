export type JobProps = {
  jobId: string;
  tenantId: string;
  status: string;
  updatedAt: string;
  assignedDriverId?: string | null;
  assignedVehicleId?: string | null;
  assignedAt?: string | null;
  deliveredAt?: string | null;
  cancelledAt?: string | null;
};

export class Job {
  private constructor(private readonly props: JobProps) {}

  static create(props: JobProps): Job {
    if (!props.jobId.trim()) {
      throw new Error("jobId is required");
    }
    if (!props.tenantId.trim()) {
      throw new Error("tenantId is required");
    }
    if (!props.status.trim()) {
      throw new Error("status is required");
    }

    return new Job({
      ...props,
      jobId: props.jobId.trim(),
      tenantId: props.tenantId.trim(),
      status: props.status.trim(),
      updatedAt: props.updatedAt,
    });
  }

  get jobId() {
    return this.props.jobId;
  }

  get tenantId() {
    return this.props.tenantId;
  }

  get status() {
    return this.props.status;
  }

  get updatedAt() {
    return this.props.updatedAt;
  }

  updateStatus(status: string, updatedAt = new Date().toISOString()): Job {
    return Job.create({
      ...this.toPrimitives(),
      status,
      updatedAt,
    });
  }

  get assignedDriverId() { return this.props.assignedDriverId ?? null; }
  get assignedVehicleId() { return this.props.assignedVehicleId ?? null; }
  get assignedAt() { return this.props.assignedAt ?? null; }
  get deliveredAt() { return this.props.deliveredAt ?? null; }
  get cancelledAt() { return this.props.cancelledAt ?? null; }

  toPrimitives(): JobProps {
    return { ...this.props };
  }
}
