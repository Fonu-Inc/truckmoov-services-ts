import { Inject, Injectable } from '@nestjs/common';
import {
  ONBOARDING_APPLICATION_REPOSITORY,
  type OnboardingApplicationRepository,
  type StoredOnboardingApplicationVehicle,
} from '@auth/onboarding/domain/onboarding-application.repository';
import { lagosDate } from '@shared/devices';
import {
  ACTIVITY_MEASURES,
  JOB_EVENT_STAMPS,
  type ActivityMeasure,
  type DeviceScopeEntry,
  type DeviceScopeQuery,
  type InstallationJobReader,
  type JobEvent,
  type JobEventType,
  type JobFilters,
  type JobPageRequest,
  type JobRow,
  type JobSort,
  type MonthlyCount,
  type MonthRange,
} from '@auth/installation/domain/installation-job.reader';
import { INSTALLATION_SLOT_HOURS } from '@auth/installation/domain/installation-order';
import type { StoredInstallationOrder } from '@auth/installation/domain/installation-order.repository';
import {
  InMemoryInstallationOrderRepository,
  InMemoryInstallerRepository,
} from './in-memory-installation.repositories';

type Candidate = JobRow & { registrations: string[] };

const time = (value: Date | null) => value?.getTime() ?? Number.NEGATIVE_INFINITY;
const finishedAt = (order: StoredInstallationOrder) => order.completedAt ?? order.cancelledAt;

const slotStart = (order: StoredInstallationOrder) => INSTALLATION_SLOT_HOURS[order.timeSlot].start;

const SORTS: Record<JobSort, (a: Candidate, b: Candidate) => number> = {
  scheduled: (a, b) =>
    a.order.scheduledDate.getTime() - b.order.scheduledDate.getTime() ||
    slotStart(a.order) - slotStart(b.order) ||
    a.order.createdAt.getTime() - b.order.createdAt.getTime() ||
    a.order.id.localeCompare(b.order.id),
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
  return [order.orderNumber, candidate.customerName, order.addressLine, order.city, order.state, ...candidate.registrations]
    .some((field) => field.toLowerCase().includes(q));
}

function inDeviceScope(order: StoredInstallationOrder, query: DeviceScopeQuery): boolean {
  if (query.statuses.includes(order.status)) return true;
  return order.status === 'completed' && inRange(order.completedAt, query.completedFrom, query.completedBefore);
}

const STEPS = Object.keys(JOB_EVENT_STAMPS) as JobEventType[];

function eventsOf(order: StoredInstallationOrder): JobEvent[] {
  return STEPS.flatMap((type) => {
    const at = order[JOB_EVENT_STAMPS[type]];
    return at instanceof Date ? [{ type, orderId: order.id, jobNumber: order.orderNumber, occurredAt: at }] : [];
  });
}

function newestFirst(a: JobEvent, b: JobEvent): number {
  return b.occurredAt.getTime() - a.occurredAt.getTime() || STEPS.indexOf(b.type) - STEPS.indexOf(a.type) || a.orderId.localeCompare(b.orderId);
}

function matches(candidate: Candidate, filters: JobFilters): boolean {
  const { order } = candidate;
  return (!filters.orderId || order.id === filters.orderId) &&
    (!filters.installerId || order.installerId === filters.installerId) &&
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
    @Inject(InMemoryInstallerRepository) private readonly installers: InMemoryInstallerRepository,
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

  async deviceScope(query: DeviceScopeQuery): Promise<DeviceScopeEntry[]> {
    const installer = await this.installers.findByUserId(query.userId);
    if (installer?.status !== 'active') return [];
    return this.orders
      .snapshot()
      .filter(({ order }) => order.installerId === installer.id && inDeviceScope(order, query))
      .sort((a, b) => a.order.scheduledDate.getTime() - b.order.scheduledDate.getTime() || a.order.orderNumber.localeCompare(b.order.orderNumber))
      .flatMap(({ order, assignments }) =>
        assignments.flatMap((unit) =>
          unit.fleetDeviceId
            ? [{ tenantId: order.tenantId, orderId: order.id, jobNumber: order.orderNumber, deviceId: unit.fleetDeviceId }]
            : [],
        ),
      );
  }

  async monthlyActivity(installerId: string, measure: ActivityMeasure, range: MonthRange): Promise<MonthlyCount[]> {
    const counts = new Map<string, number>();
    for (const { order } of this.orders.snapshot()) {
      const at = order[ACTIVITY_MEASURES[measure]];
      if (order.installerId !== installerId || order.status === 'assigned' || !inRange(at, range.from, range.before)) continue;
      const month = lagosDate(at!).slice(0, 7);
      counts.set(month, (counts.get(month) ?? 0) + 1);
    }
    return [...counts].map(([month, count]) => ({ month, count }));
  }

  async recentEvents(installerId: string, limit: number): Promise<JobEvent[]> {
    return this.orders
      .snapshot()
      .filter(({ order }) => order.installerId === installerId)
      .flatMap(({ order }) => eventsOf(order))
      .sort(newestFirst)
      .slice(0, limit);
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
      customerEmail: application?.businessEmail ?? null,
      tenantType: application?.applicantType ?? null,
      firstVehicle: first ? { registrationNumber: first.registrationNumber, make: first.make, model: first.model } : null,
      firstFleetDeviceId: assignments[0]?.fleetDeviceId ?? null,
      vehicleCount: new Set(assignments.map((a) => a.vehicleId)).size,
      deviceCount: assignments.length,
      registrations: fitted.map((v) => v.registrationNumber),
    };
  }
}
