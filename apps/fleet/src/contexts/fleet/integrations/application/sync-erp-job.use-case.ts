import { Inject, Injectable } from "@nestjs/common";
import { Job } from "../../jobs/domain/entities/job.entity";
import { JOB_REPOSITORY, type JobRepository } from "../../jobs/domain/repositories/job.repository";

export type ErpJobPayload = {
  externalId: string;
  tenantId: string;
  status: "created" | "updated" | "cancelled";
  jobData: {
    referenceId?: string;
    pickupAddress?: string;
    dropoffAddress?: string;
    scheduledAt?: string;
    priority?: string;
    [key: string]: unknown;
  };
};

@Injectable()
export class SyncErpJobUseCase {
  constructor(@Inject(JOB_REPOSITORY) private readonly jobRepo: JobRepository) {}

  async execute(payload: ErpJobPayload): Promise<Job> {
    const jobId = payload.externalId;
    const existing = await this.jobRepo.findByJobId(jobId);

    const status = payload.status === "cancelled" ? "cancelled" : payload.status === "created" ? "pending" : "pending";

    if (existing) {
      const updated = existing.updateStatus(status);
      await this.jobRepo.save(updated);
      return updated;
    }

    const job = Job.create({
      jobId,
      tenantId: payload.tenantId,
      status,
      updatedAt: new Date().toISOString(),
    });
    await this.jobRepo.save(job);
    return job;
  }
}
