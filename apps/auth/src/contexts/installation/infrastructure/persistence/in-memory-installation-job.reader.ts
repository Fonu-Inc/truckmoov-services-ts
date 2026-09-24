import { Inject, Injectable } from '@nestjs/common';
import {
  ONBOARDING_APPLICATION_REPOSITORY,
  type OnboardingApplicationRepository,
  type StoredOnboardingApplicationVehicle,
} from '@auth/onboarding/domain/onboarding-application.repository';
import type {
  InstallationJobReader,
  JobFilters,
  JobPageRequest,
  JobRow,
  JobSort,
} from '@auth/installation/domain/installation-job.reader';
import type { StoredInstallationOrder } from '@auth/installation/domain/installation-order.repository';
import { InMemoryInstallationOrderRepository } from './in-memory-installation.repositories';

type Candidate = JobRow & { registrations: string[] };

const time = (value: Date | null) => value?.getTime() ?? Number.NEGATIVE_INFINITY;
const finishedAt = (order: StoredInstallationOrder) => order.completedAt ?? order.cancelledAt;

const SORTS: Record<JobSort, (a: Candidate, b: Candidate) => number> = {
  scheduled: (a, b) => a.order.scheduledDate.getTime() - b.order.scheduledDate.getTime(),
  completion: (a, b) => time(finishedAt(b.order)) - time(finishedAt(a.order)),
  newest: (a, b) => b.order.createdAt.getTime() - a.order.createdAt.getTime(),
};

function inRange(value: Date | null, from?: Date, before?: Date): boolean {
  if (!from && !before) return true;
  if (!value) return false;
  return (!from || value >= from) && (!before || value < before);
}

function scheduledIn(order: StoredInstallationOrder, filters: JobFilters): boolean {
  const day = order.scheduledDate.getTime();
  return (!filters.scheduledFrom || day >= filters.scheduledFrom.getTime()) &&
    (!filters.scheduledBefore || day < filters.scheduledBefore.getTime());
}

function searched(candidate: Candidate, search?: string): boolean {
  const q = search?.trim().toLowerCase();
  if (!q) return true;
  const { order } = candidate;
  return [order.orderNumber, candidate.customerName, order.city, order.state, ...candidate.registrations]
    .some((field) => field.toLowerCase().includes(q));
}

function matches(candidate: Candidate, filters: JobFilters): boolean {
  const { order } = candidate;
  return (!filters.installerId || order.installerId === filters.installerId) &&
    (!filters.statuses || filters.statuses.includes(order.status)) &&
    scheduledIn(order, filters) &&
    inRange(finishedAt(order), filters.completedFrom, filters.completedBefore) &&
    searched(candidate, filters.search);
}

@Injectable()
export class InMemoryInstallationJobReader implements InstallationJobReader {
  constructor(
    @Inject(InMemoryInstallationOrderRepository) private readonly orders: InMemoryInstallationOrderRepository,
    @Inject(ONBOARDING_APPLICATION_REPOSITORY) private readonly applications: OnboardingApplicationRepository,
  ) {}

  async list(filters: JobFilters, page: JobPageRequest): Promise<{ items: JobRow[]; total: number }> {
    const found = (await this.matching(filters)).sort(SORTS[filters.sort ?? 'scheduled']);
    const offset = (page.page - 1) * page.limit;
    return {
      items: found.slice(offset, offset + page.limit).map(({ registrations: _, ...row }) => row),
      total: found.length,
    };
  }

  async count(filters: JobFilters): Promise<number> {
    return (await this.matching(filters)).length;
  }

  private async matching(filters: JobFilters): Promise<Candidate[]> {
    const candidates = await Promise.all(this.orders.snapshot().map((entry) => this.candidate(entry)));
    return candidates.filter((c) => matches(c, filters));
  }

  private async candidate(
    entry: ReturnType<InMemoryInstallationOrderRepository['snapshot']>[number],
  ): Promise<Candidate> {
    const { order, assignments } = entry;
    const [application, vehicles] = await Promise.all([
      this.applications.findById(order.applicationId),
      this.applications.findVehiclesByApplicationId(order.applicationId),
    ]);
    const byId = new Map<string, StoredOnboardingApplicationVehicle>(vehicles.map((v) => [v.id, v]));
    const fitted = assignments.map((a) => byId.get(a.vehicleId)).filter((v) => v !== undefined);
    const first = fitted[0];
    return {
      order,
      customerName: application?.organizationName ?? '',
      firstVehicle: first ? { registrationNumber: first.registrationNumber, make: first.make, model: first.model } : null,
      firstFleetDeviceId: assignments[0]?.fleetDeviceId ?? null,
      vehicleCount: new Set(assignments.map((a) => a.vehicleId)).size,
      deviceCount: assignments.length,
      registrations: fitted.map((v) => v.registrationNumber),
    };
  }
}
