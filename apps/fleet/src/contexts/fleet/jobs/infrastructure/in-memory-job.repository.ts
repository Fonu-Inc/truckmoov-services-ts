import { Injectable } from "@nestjs/common";
import { Job } from "../domain/entities/job.entity";
import type { JobFilters, JobRepository } from "../domain/repositories/job.repository";

@Injectable()
export class InMemoryJobRepository implements JobRepository {
  private readonly data = new Map<string, Job>();

  async save(job: Job): Promise<void> {
    this.data.set(job.jobId, job);
  }

  async findByJobId(jobId: string): Promise<Job | null> {
    return this.data.get(jobId) ?? null;
  }

  async findAll(filters?: JobFilters): Promise<Job[]> {
    const query = filters?.query?.trim().toLowerCase();

    return Array.from(this.data.values()).filter((job) => {
      if (filters?.tenantId && job.tenantId !== filters.tenantId) {
        return false;
      }
      if (filters?.status && job.status !== filters.status) {
        return false;
      }
      if (!query) {
        return true;
      }

      return [job.jobId, job.status].some((value) =>
        value.toLowerCase().includes(query),
      );
    });
  }
}
