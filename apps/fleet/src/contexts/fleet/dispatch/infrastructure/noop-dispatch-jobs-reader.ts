import { Injectable } from "@nestjs/common";
import type {
  DispatchActiveJobsMap,
  DispatchJob,
  DispatchJobsReader,
} from "../domain/ports/dispatch-jobs-reader.port";
import { EMPTY_ACTIVE_JOBS_MAP } from "../domain/ports/dispatch-jobs-reader.port";

@Injectable()
export class NoopDispatchJobsReader implements DispatchJobsReader {
  async listJobs(): Promise<DispatchJob[]> {
    return [];
  }

  async getJob(): Promise<DispatchJob | null> {
    return null;
  }

  async listActiveJobsMap(): Promise<DispatchActiveJobsMap> {
    return EMPTY_ACTIVE_JOBS_MAP;
  }
}
