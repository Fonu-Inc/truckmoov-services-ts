import type { Job } from "../entities/job.entity";

export type JobFilters = {
  tenantId?: string;
  query?: string;
  status?: string;
};

export interface JobRepository {
  save(job: Job): Promise<void>;
  findByJobId(jobId: string): Promise<Job | null>;
  findAll(filters?: JobFilters): Promise<Job[]>;
}

export const JOB_REPOSITORY = Symbol("JOB_REPOSITORY");
