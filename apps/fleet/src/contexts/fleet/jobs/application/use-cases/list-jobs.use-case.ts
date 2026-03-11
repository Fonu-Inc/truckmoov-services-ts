import { Inject, Injectable } from "@nestjs/common";
import {
  JOB_REPOSITORY,
  type JobFilters,
  type JobRepository,
} from "../../domain/repositories/job.repository";

@Injectable()
export class ListJobsUseCase {
  constructor(
    @Inject(JOB_REPOSITORY)
    private readonly jobRepository: JobRepository,
  ) {}

  async execute(filters?: JobFilters) {
    const jobs = await this.jobRepository.findAll(filters);
    return jobs.map((job) => job.toPrimitives());
  }
}
