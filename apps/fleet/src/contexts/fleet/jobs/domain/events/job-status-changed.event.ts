export type JobStatusChangedEvent = {
  id: string;
  type: "job.status.changed";
  version: 1;
  occurred_at: string;
  tenant_id: string;
  data: {
    job_id: string;
    new_status: string;
  };
};

export function createJobStatusChangedEvent(params: {
  id: string;
  occurredAt: string;
  tenantId: string;
  jobId: string;
  newStatus: string;
}): JobStatusChangedEvent {
  return {
    id: params.id,
    type: "job.status.changed",
    version: 1,
    occurred_at: params.occurredAt,
    tenant_id: params.tenantId,
    data: {
      job_id: params.jobId,
      new_status: params.newStatus,
    },
  };
}
