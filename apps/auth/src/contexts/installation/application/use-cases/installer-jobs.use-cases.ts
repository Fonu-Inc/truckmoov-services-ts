import { Inject, Injectable } from '@nestjs/common';
import { TOKEN_SERVICE } from '@auth/session';
import type { TokenService } from '@auth/session/domain/ports/token-service.port';
import {
  ONBOARDING_APPLICATION_REPOSITORY,
  type OnboardingApplicationRepository,
} from '@auth/onboarding/domain/onboarding-application.repository';
import { OnboardingValidationError } from '@auth/onboarding/domain/onboarding-application.validation';
import {
  ACTIVE_JOB_STATUSES,
  INSTALLATION_ORDER_STATUSES,
  OPEN_JOB_STATUSES,
  TERMINAL_JOB_STATUSES,
  type InstallationOrderStatus,
} from '@auth/installation/domain/installation-order';
import {
  INSTALLATION_ORDER_REPOSITORY,
  type InstallationOrderRepository,
} from '@auth/installation/domain/installation-order.repository';
import {
  INSTALLATION_JOB_READER,
  type InstallationJobReader,
  type JobFilters,
} from '@auth/installation/domain/installation-job.reader';
import {
  INSTALLER_REPOSITORY,
  type InstallerRepository,
  type StoredInstaller,
} from '@auth/installation/domain/installer.repository';
import {
  JOB_DEVICE_LOOKUP,
  type JobDeviceLookup,
} from '@auth/installation/domain/ports/job-device-lookup.port';
import { lagosDayBounds, lagosToday, nextCalendarDay } from '@shared/devices';
import { INSTALLATION_JOB_CONTEXT } from '@auth/installation/domain/installer-support';
import { SIM_REPOSITORY, type SimRepository } from '../../../../sim.repository';
import { SUPPORT_TICKET_REPOSITORY, type SupportTicketRepository } from '../../../../support-ticket.repository';
import { currentInstaller, installerJob } from './support/current-installer';
import { installerOptions } from './support/job-execution.views';
import { MAX_PAGE_SIZE, pageOf } from './support/paging';
import { devicesForJobs, toJobDetail, toJobListItem } from './support/installation-job.views';
import { installerSupportOptions, toJobIssueView } from './support/installer-ticket.views';

export type JobScope = 'active' | 'history';

export type ListJobsQuery = {
  scope?: JobScope;
  status?: InstallationOrderStatus;
  search?: string;
  completedFrom?: string;
  completedTo?: string;
  page?: number;
  limit?: number;
};

const TODAY_LIMIT = MAX_PAGE_SIZE;
const BOOKED: InstallationOrderStatus[] = ['accepted', 'scheduled'];

const SCOPES: Record<JobScope, readonly InstallationOrderStatus[]> = {
  active: OPEN_JOB_STATUSES,
  history: TERMINAL_JOB_STATUSES,
};

function isCalendarDay(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function calendarDay(field: string, value: string): string {
  if (!isCalendarDay(value)) {
    throw new OnboardingValidationError(field, `${field} must be a date (YYYY-MM-DD)`);
  }
  return value;
}

function completionRange(query: ListJobsQuery): Pick<JobFilters, 'completedFrom' | 'completedBefore'> {
  return {
    completedFrom: query.completedFrom ? lagosDayBounds(calendarDay('completedFrom', query.completedFrom)).start : undefined,
    completedBefore: query.completedTo ? lagosDayBounds(calendarDay('completedTo', query.completedTo)).end : undefined,
  };
}

function scopedStatuses(scope: JobScope, status?: InstallationOrderStatus): InstallationOrderStatus[] {
  const inScope = SCOPES[scope];
  return status ? inScope.filter((s) => s === status) : [...inScope];
}

/** What an installer reads about their own jobs: the dashboard, the lists and one job. */
@Injectable()
export class InstallerJobsUseCases {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokens: TokenService,
    @Inject(INSTALLER_REPOSITORY) private readonly installers: InstallerRepository,
    @Inject(INSTALLATION_ORDER_REPOSITORY) private readonly orders: InstallationOrderRepository,
    @Inject(INSTALLATION_JOB_READER) private readonly jobs: InstallationJobReader,
    @Inject(ONBOARDING_APPLICATION_REPOSITORY) private readonly applications: OnboardingApplicationRepository,
    @Inject(JOB_DEVICE_LOOKUP) private readonly devices: JobDeviceLookup,
    @Inject(SIM_REPOSITORY) private readonly sims: SimRepository,
    @Inject(SUPPORT_TICKET_REPOSITORY) private readonly tickets: SupportTicketRepository,
  ) {}

  async dashboard(accessToken: string, now: Date = new Date()) {
    const installer = await this.installer(accessToken);
    const today = lagosToday(now);
    const tomorrow = nextCalendarDay(today);
    const mine = { installerId: installer.id };
    const [counts, todays, bookedToday, upcoming] = await Promise.all([
      this.statusCounts(installer),
      this.jobs.list({ ...mine, statuses: ACTIVE_JOB_STATUSES, scheduledFrom: today, scheduledBefore: tomorrow }, { page: 1, limit: TODAY_LIMIT }),
      this.jobs.count({ ...mine, statuses: BOOKED, scheduledFrom: today, scheduledBefore: tomorrow }),
      this.jobs.count({ ...mine, statuses: BOOKED, scheduledFrom: tomorrow }),
    ]);

    return {
      counters: {
        newlyAssigned: counts.assigned,
        scheduledToday: bookedToday,
        upcoming,
        inProgress: counts.in_progress,
        overdue: counts.overdue,
        completed: counts.completed,
        issuesReported: counts.issue_reported,
      },
      statusOverview: {
        accepted: counts.accepted,
        scheduled: counts.scheduled,
        inProgress: counts.in_progress,
        overdue: counts.overdue,
        completed: counts.completed,
      },
      todaysJobs: await this.listItems(todays.items),
    };
  }

  async list(accessToken: string, query: ListJobsQuery) {
    const installer = await this.installer(accessToken);
    const scope = query.scope ?? 'active';
    const { page, limit } = pageOf(query);
    const filters: JobFilters = {
      installerId: installer.id,
      statuses: scopedStatuses(scope, query.status),
      search: query.search,
      ...completionRange(query),
      sort: scope === 'history' ? 'completion' : 'scheduled',
    };
    const [counts, found] = await Promise.all([this.statusCounts(installer), this.jobs.list(filters, { page, limit })]);
    const all = Object.values(counts).reduce((sum, n) => sum + n, 0);

    return { countsByStatus: { all, ...counts }, items: await this.listItems(found.items), page, limit, total: found.total };
  }

  async detail(accessToken: string, jobId: string) {
    const { installer, order } = await installerJob(
      { tokens: this.tokens, installers: this.installers, orders: this.orders },
      accessToken,
      jobId,
    );
    const [application, assignments, vehicles, ticks, evidence, issues] = await Promise.all([
      this.applications.findById(order.applicationId),
      this.orders.findAssignments(order.id),
      this.applications.findVehiclesByApplicationId(order.applicationId),
      this.orders.findTicks(order.id),
      this.orders.findEvidence(order.id),
      this.tickets.findByRelatedOrders([order.id], INSTALLATION_JOB_CONTEXT),
    ]);
    const deviceIds = assignments.flatMap((a) => (a.fleetDeviceId ? [a.fleetDeviceId] : []));
    const [devices, sims] = await Promise.all([
      devicesForJobs(this.devices, deviceIds.map((deviceId) => ({ tenantId: order.tenantId, deviceId }))),
      this.sims.findByDeviceIds(deviceIds),
    ]);

    const detail = toJobDetail({
      order,
      application,
      assignments,
      vehicles,
      devices,
      sims: sims.filter((sim) => sim.tenantId === order.tenantId),
      installer,
      ticks,
      evidence,
    });
    return { ...detail, issues: issues.map(toJobIssueView) };
  }

  async options(accessToken: string) {
    await this.installer(accessToken);
    return { ...installerOptions(), ...installerSupportOptions() };
  }

  private installer(accessToken: string): Promise<StoredInstaller> {
    return currentInstaller({ tokens: this.tokens, installers: this.installers }, accessToken);
  }

  private async statusCounts(installer: StoredInstaller): Promise<Record<InstallationOrderStatus, number>> {
    const counts = Object.fromEntries(INSTALLATION_ORDER_STATUSES.map((s) => [s, 0])) as Record<InstallationOrderStatus, number>;
    for (const row of await this.orders.countByInstaller([installer.id])) {
      if (row.status in counts) counts[row.status] += row.count;
    }
    return counts;
  }

  private async listItems(rows: Awaited<ReturnType<InstallationJobReader['list']>>['items']) {
    const devices = await devicesForJobs(
      this.devices,
      rows.map((row) => ({ tenantId: row.order.tenantId, deviceId: row.firstFleetDeviceId })),
    );
    return rows.map((row) => toJobListItem(row, devices));
  }
}
