import { Injectable } from "@nestjs/common";
import type { DispatchJob, DispatchJobsReader } from "../domain/ports/dispatch-jobs-reader.port";

@Injectable()
export class NoopDispatchJobsReader implements DispatchJobsReader {
  async listJobs(): Promise<DispatchJob[]> {
    return [];
  }
}
