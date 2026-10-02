import { Inject, Injectable } from "@nestjs/common";
import { DISPATCH_JOBS_READER, type DispatchJobsReader } from "../../dispatch/domain/ports/dispatch-jobs-reader.port";
import { isCompletedJob, jobCompletedAt } from "../domain/report-jobs";
import { isWithin, trendBuckets, type TrendRange } from "../domain/report-window";

export type ActivityTrendPoint = { label: string; from: string; to: string; created: number; completed: number };

/** Jobs created vs completed per bucket of the chosen range. */
@Injectable()
export class ActivityTrendUseCase {
  constructor(@Inject(DISPATCH_JOBS_READER) private readonly dispatchJobs: DispatchJobsReader) {}

  async execute(tenantId: string, range: TrendRange): Promise<ActivityTrendPoint[]> {
    const jobs = await this.dispatchJobs.listJobs(tenantId);
    const completed = jobs.filter(isCompletedJob);
    return trendBuckets(range).map((bucket) => ({
      label: bucket.label,
      from: bucket.from.toISOString(),
      to: bucket.to.toISOString(),
      created: jobs.filter((j) => isWithin(j.createdAt, bucket)).length,
      completed: completed.filter((j) => isWithin(jobCompletedAt(j), bucket)).length,
    }));
  }
}
