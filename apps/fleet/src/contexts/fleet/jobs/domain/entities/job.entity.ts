export type JobProps = {
  jobId: string;
  tenantId: string;
  status: string;
  updatedAt: string;
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

  toPrimitives(): JobProps {
    return {
      jobId: this.jobId,
      tenantId: this.tenantId,
      status: this.status,
      updatedAt: this.updatedAt,
    };
  }
}
