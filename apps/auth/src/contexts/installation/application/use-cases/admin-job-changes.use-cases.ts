import { Inject, Injectable } from '@nestjs/common';
import { SYSTEM_TENANT_ID } from '@shared/identity';
import { TOKEN_SERVICE, USER_REPOSITORY } from '@auth/session';
import type { TokenService } from '@auth/session/domain/ports/token-service.port';
import type { UserRepository } from '@auth/session/domain/ports/user-repository.port';
import {
  OnboardingValidationError,
  validateCity,
  validateContactFullName,
  validateNigerianPhone,
  validateState,
  validateStreetAddress,
} from '@auth/onboarding/domain/onboarding-application.validation';
import {
  DETAILS_LOCKED_STATUSES,
  TERMINAL_JOB_STATUSES,
  assertSchedulable,
  bookingDay,
  transitionOrder,
} from '@auth/installation/domain/installation-order';
import {
  INSTALLATION_ORDER_REPOSITORY,
  type InstallationOrderDetails,
  type InstallationOrderRepository,
  type StoredInstallationOrder,
} from '@auth/installation/domain/installation-order.repository';
import {
  InstallationJobClosedError,
  InstallationJobConflictError,
  InstallationJobNotFoundError,
} from '@auth/installation/domain/installation-job.errors';
import { AccessResolver } from '../../../../access-resolver';
import { ActivityLogService } from '../../../../activity-log.service';
import { requireStaff, type Staff } from './support/platform-staff';
import { JOB_CHANGED_MESSAGE, moveJob } from './support/job-transition';
import { validateTimeSlot } from './schedule-installation.use-case';

export type IssueOutcome = 'resume' | 'cancel';
export const ISSUE_OUTCOMES: readonly IssueOutcome[] = ['resume', 'cancel'];
export const MAX_RESOLUTION_NOTE_LENGTH = 1000;

export type JobDetailsChange = {
  scheduledDate?: unknown;
  timeSlot?: unknown;
  addressLine?: unknown;
  city?: unknown;
  state?: unknown;
  siteContactName?: unknown;
  siteContactPhone?: unknown;
};

type DetailValidators = { [K in keyof InstallationOrderDetails]: (value: unknown) => InstallationOrderDetails[K] };

/** The booking's own rules. */
function detailValidators(now: Date): DetailValidators {
  return {
    scheduledDate: (value) => {
      const day = bookingDay(value);
      assertSchedulable(day, now);
      return day;
    },
    timeSlot: validateTimeSlot,
    addressLine: validateStreetAddress,
    city: validateCity,
    state: validateState,
    siteContactName: validateContactFullName,
    siteContactPhone: (value) => validateNigerianPhone(value, 'siteContactPhone'),
  };
}

function changedDetails(change: JobDetailsChange, now: Date): Partial<InstallationOrderDetails> {
  const entries = Object.entries(detailValidators(now)).flatMap(([field, validate]) => {
    const value = change[field as keyof JobDetailsChange];
    return value === undefined ? [] : [[field, validate(value)] as const];
  });
  if (entries.length === 0) throw new OnboardingValidationError('body', 'Nothing to change');
  return Object.fromEntries(entries);
}

function issueOutcome(value: unknown): IssueOutcome {
  if (!ISSUE_OUTCOMES.includes(value as IssueOutcome)) {
    throw new OnboardingValidationError('outcome', `outcome must be one of: ${ISSUE_OUTCOMES.join(', ')}`);
  }
  return value as IssueOutcome;
}

function resolutionNote(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const note = String(value).trim();
  if (note.length > MAX_RESOLUTION_NOTE_LENGTH) {
    throw new OnboardingValidationError('note', `note must be ${MAX_RESOLUTION_NOTE_LENGTH} characters or fewer`);
  }
  return note || null;
}

/** An overdue job given a new date is booked again, now or when its reported issue is resumed. */
function afterDetailsChange(
  order: StoredInstallationOrder,
  changed: Partial<InstallationOrderDetails>,
  now: Date,
): StoredInstallationOrder {
  const edited = { ...order, ...changed, updatedAt: now };
  if (!changed.scheduledDate) return edited;
  if (order.status === 'overdue') return transitionOrder(edited, 'scheduled', now);
  const pausedOverdue = order.status === 'issue_reported' && order.preExceptionStatus === 'overdue';
  return pausedOverdue ? { ...edited, preExceptionStatus: 'scheduled' } : edited;
}

/** Platform admin's hand on a job: resolving an issue report, and changing the booking. */
@Injectable()
export class AdminJobChangesUseCases {
  constructor(
    @Inject(INSTALLATION_ORDER_REPOSITORY) private readonly orders: InstallationOrderRepository,
    @Inject(TOKEN_SERVICE) private readonly tokens: TokenService,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(AccessResolver) private readonly access: AccessResolver,
    @Inject(ActivityLogService) private readonly activity: ActivityLogService,
  ) {}

  async resolveIssue(accessToken: string, orderId: string, requested: unknown, note?: unknown, now: Date = new Date()) {
    const staff = await this.staff(accessToken);
    const outcome = issueOutcome(requested);
    const text = resolutionNote(note);
    const order = await this.order(orderId);
    if (order.status !== 'issue_reported') {
      throw new InstallationJobConflictError('Only a job with a reported issue can be resolved');
    }
    const next = outcome === 'cancel' ? 'cancelled' : order.preExceptionStatus;
    if (!next) throw new InstallationJobConflictError('This job has no status to resume');
    const moved = await moveJob(this.orders, order, next, now);
    await this.audit(staff, moved, 'system.installation.issue_resolved', `Issue on ${order.orderNumber} resolved: ${outcome}`, {
      outcome,
      note: text,
      status: moved.status,
    });
    return { id: moved.id, jobNumber: moved.orderNumber, status: moved.status };
  }

  async updateDetails(accessToken: string, orderId: string, change: JobDetailsChange, now: Date = new Date()) {
    const staff = await this.staff(accessToken);
    const order = await this.order(orderId);
    if (TERMINAL_JOB_STATUSES.includes(order.status)) throw new InstallationJobClosedError();
    if (DETAILS_LOCKED_STATUSES.includes(order.status)) {
      throw new InstallationJobConflictError(`A job that is ${order.status} cannot be rescheduled or edited`);
    }
    const changed = changedDetails(change, now);
    const updated = afterDetailsChange(order, changed, now);
    if (!(await this.orders.saveDetails(updated, order.status))) throw new InstallationJobConflictError(JOB_CHANGED_MESSAGE);
    await this.audit(staff, updated, 'system.installation.updated', `${order.orderNumber} details updated`, {
      fields: Object.keys(changed),
      status: updated.status,
    });
    return { id: updated.id, jobNumber: updated.orderNumber, status: updated.status };
  }

  private staff(accessToken: string): Promise<Staff> {
    return requireStaff({ tokens: this.tokens, access: this.access, users: this.users }, accessToken, 'admin.installations.manage');
  }

  private async order(orderId: string): Promise<StoredInstallationOrder> {
    const order = await this.orders.findById(orderId);
    if (!order) throw new InstallationJobNotFoundError();
    return order;
  }

  private async audit(
    staff: Staff,
    order: StoredInstallationOrder,
    action: string,
    summary: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await this.activity.record({
      tenantId: SYSTEM_TENANT_ID,
      service: 'auth',
      action,
      entityType: 'installation_order',
      entityId: order.id,
      summary,
      actorId: staff.id,
      actorRole: staff.role,
      actorEmail: staff.email,
      metadata: { orderTenantId: order.tenantId, ...metadata },
    });
  }
}
