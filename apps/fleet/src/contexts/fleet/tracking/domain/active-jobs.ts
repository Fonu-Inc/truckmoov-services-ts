import type { DispatchJob } from "../../dispatch/domain/ports/dispatch-jobs-reader.port";

/**
 * A job that puts a vehicle "in progress" on the map.
 *
 * Everything dispatch knows about except the two terminal states. `created` is
 * excluded deliberately: a job nobody has been assigned to yet is work waiting,
 * not a vehicle out on the road.
 */
export const ACTIVE_JOB_STATUSES: readonly string[] = [
  "assigned",
  "en-route",
  "arrived",
  "loaded",
];

export function isActiveJob(job: Pick<DispatchJob, "status">): boolean {
  return ACTIVE_JOB_STATUSES.includes(job.status);
}

/**
 * The one job each vehicle is currently running.
 *
 * A vehicle should only carry one, but dispatch does not guarantee it, so the
 * most recently updated wins rather than whichever the list happened to yield
 * first — otherwise the panel's job and ETA change between refreshes.
 */
export function activeJobByVehicle(jobs: DispatchJob[]): Map<string, DispatchJob> {
  const byVehicle = new Map<string, DispatchJob>();

  for (const job of jobs) {
    if (!job.assignedVehicleId || !isActiveJob(job)) continue;
    const current = byVehicle.get(job.assignedVehicleId);
    if (!current || Date.parse(job.updatedAt) >= Date.parse(current.updatedAt)) {
      byVehicle.set(job.assignedVehicleId, job);
    }
  }

  return byVehicle;
}
