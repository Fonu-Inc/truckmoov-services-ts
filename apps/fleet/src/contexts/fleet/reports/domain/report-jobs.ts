import type { DispatchJob } from "../../dispatch/domain/ports/dispatch-jobs-reader.port";

const COMPLETED = new Set(["delivered", "completed"]);
const ON_THE_ROAD = new Set(["en-route", "arrived", "loaded", "in_progress"]);

export const isCompletedJob = (job: DispatchJob) => COMPLETED.has(job.status);
export const isJobOnTheRoad = (job: DispatchJob) => ON_THE_ROAD.has(job.status);

/** Dispatch only stamps completion inside punctuality; older jobs fall back to their last update. */
export const jobCompletedAt = (job: DispatchJob) => job.punctuality?.completedAt || job.updatedAt;
