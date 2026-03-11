import { Injectable } from "@nestjs/common";
import { AppConfigService } from "@shared/config";
import { Job } from "../domain/entities/job.entity";
import type { JobFilters, JobRepository } from "../domain/repositories/job.repository";
import { JobRecord, getFleetOrm } from "../../shared/infrastructure/persistence/fleet-orm";

@Injectable()
export class MikroJobRepository implements JobRepository {
  constructor(private readonly config: AppConfigService) {}

  async save(job: Job): Promise<void> {
    const orm = await getFleetOrm(this.config.db);
    const em = orm.em.fork();

    await em.upsert(JobRecord, {
      jobId: job.jobId,
      tenantId: job.tenantId,
      status: job.status,
      updatedAt: new Date(job.updatedAt),
    });
  }

  async findByJobId(jobId: string): Promise<Job | null> {
    const orm = await getFleetOrm(this.config.db);
    const em = orm.em.fork();
    const record = await em.findOne(JobRecord, { jobId });
    return record ? this.toDomain(record) : null;
  }

  async findAll(filters?: JobFilters): Promise<Job[]> {
    const orm = await getFleetOrm(this.config.db);
    const em = orm.em.fork();

    const records = await em.find(
      JobRecord,
      {
        ...(filters?.tenantId ? { tenantId: filters.tenantId } : {}),
        ...(filters?.status ? { status: filters.status } : {}),
      },
      { orderBy: { updatedAt: "desc" } },
    );

    const query = filters?.query?.trim().toLowerCase();
    const filtered = !query
      ? records
      : records.filter((record) =>
          [record.jobId, record.status].some((value) =>
            value.toLowerCase().includes(query),
          ),
        );

    return filtered.map((record) => this.toDomain(record));
  }

  private toDomain(record: JobRecord): Job {
    return Job.create({
      jobId: record.jobId,
      tenantId: record.tenantId,
      status: record.status,
      updatedAt: record.updatedAt.toISOString(),
    });
  }
}
