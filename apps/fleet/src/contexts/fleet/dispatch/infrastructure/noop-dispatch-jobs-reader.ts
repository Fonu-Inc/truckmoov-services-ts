import { Injectable } from "@nestjs/common";
import type { DispatchJob, DispatchJobsReader } from "../domain/ports/dispatch-jobs-reader.port";

/** Used with the in-memory persistence backend where no dispatch service exists. */
@Injectable()
export class NoopDispatchJobsReader implements DispatchJobsReader {
  async listJobs(): Promise<DispatchJob[]> {
    return [];
  }
}
