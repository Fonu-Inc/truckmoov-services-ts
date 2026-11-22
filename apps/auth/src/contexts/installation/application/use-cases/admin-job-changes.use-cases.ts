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
  assignOrder,
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
  INSTALLER_REPOSITORY,
  type InstallerRepository,
} from '@auth/installation/domain/installer.repository';
import { InstallerNotFoundError, InstallerStateError } from '@auth/installation/domain/installer';
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
import { assignedNotice, InstallerNotifier } from '../services/installer-notifier.service';

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

function assignmentConflict(outcome: 'full' | 'conflict' | 'taken' | 'declined'): string {
  if (outcome === 'full') return 'This installer already has the maximum number of active jobs';
  if (outcome === 'conflict') return 'This installer is already booked for that date and time slot';
  if (outcome === 'declined') return 'This installer already declined this job';
  return JOB_CHANGED_MESSAGE;
}

function resolutionNote(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const note = String(value).trim();
  if (note.length > MAX_RESOLUTION_NOTE_LENGTH) {
    throw new OnboardingValidationError('note', `note must be ${MAX_RESOLUTION_NOTE_LENGTH} characters or fewer`);
  }
  return note || null;
}

function isReschedule(order: StoredInstallationOrder, changed: Partial<InstallationOrderDetails>): boolean {
  return changed.scheduledDate !== undefined && changed.scheduledDate.getTime() !== order.scheduledDate.getTime();
}

/**
 * An overdue job given a new date is booked again, now or when its reported
 * issue is resumed. A new date is reminded of afresh.
 */
function afterDetailsChange(
  order: StoredInstallationOrder,
  changed: Partial<InstallationOrderDetails>,
  now: Date,
): StoredInstallationOrder {
  const reminderSentAt = isReschedule(order, changed) ? null : order.reminderSentAt;
  const edited = { ...order, ...changed, reminderSentAt, updatedAt: now };
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
    @Inject(INSTALLER_REPOSITORY) private readonly installers: InstallerRepository,
    @Inject(TOKEN_SERVICE) private readonly tokens: TokenService,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(AccessResolver) private readonly access: AccessResolver,
    @Inject(ActivityLogService) private readonly activity: ActivityLogService,
    @Inject(InstallerNotifier) private readonly notifier: InstallerNotifier,
  ) {}

  /**
   * Puts a named installer on a booking. The customer has already picked a
   * date, so a platform assignment is final rather than an offer: the job moves
   * straight to scheduled. Reassigning a scheduled or overdue job keeps that
   * status. Work that has started keeps its installer.
   */
  async assignInstaller(accessToken: string, orderId: string, installerId: string, now: Date = new Date()) {
    const staff = await this.staff(accessToken);
    const order = await this.order(orderId);
    if (TERMINAL_JOB_STATUSES.includes(order.status)) throw new InstallationJobClosedError();
    if (!['unassigned', 'assigned', 'scheduled', 'overdue'].includes(order.status)) {
      throw new InstallationJobConflictError(`A job that is ${order.status} cannot be assigned`);
    }

    const installer = await this.installers.findById(installerId);
    if (!installer) throw new InstallerNotFoundError();
    if (installer.status !== 'active') {
      throw new InstallerStateError(`Only an active installer can be assigned a job. This one is ${installer.status}`);
    }

    let saved: StoredInstallationOrder;
    if (order.status === 'unassigned') {
      const outcome = await this.orders.assignIfRoom(
        assignOrder(order, installer.id, now),
        installer.maxActiveJobs,
      );
      if (outcome !== 'assigned') throw new InstallationJobConflictError(assignmentConflict(outcome));
      const assigned = await this.orders.findById(order.id);
      if (!assigned) throw new InstallationJobNotFoundError();
      saved = transitionOrder(assigned, 'scheduled', now);
      if (!(await this.orders.transition(saved, 'assigned'))) {
        throw new InstallationJobConflictError(JOB_CHANGED_MESSAGE);
      }
    } else if (order.status === 'assigned') {
      const offered = { ...order, installerId: installer.id, updatedAt: now };
      await this.orders.save(offered);
      saved = transitionOrder(offered, 'scheduled', now);
      if (!(await this.orders.transition(saved, 'assigned'))) {
        throw new InstallationJobConflictError(JOB_CHANGED_MESSAGE);
      }
    } else {
      saved = {
        ...order,
        installerId: installer.id,
        assignedAt: order.assignedAt ?? now,
        acceptedAt: order.acceptedAt ?? now,
        updatedAt: now,
      };
      await this.orders.save(saved);
    }

    await this.audit(staff, saved, 'system.installation.assigned', `${order.orderNumber} assigned to ${installer.fullName}`, {
      installerId: installer.id,
      status: saved.status,
    });
    await this.notifier.notify(assignedNotice(saved, now), now);
    return {
      id: saved.id,
      jobNumber: saved.orderNumber,
      status: saved.status,
      installer: { id: installer.id, code: installer.code, fullName: installer.fullName },
    };
  }

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
    const type = outcome === 'cancel' ? 'job_cancelled' : 'issue_resolved';
    await this.notifier.notify({ type, order: moved, stamp: now.toISOString() }, now);
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
    const saved = await this.orders.saveDetails(updated, order.status, { clearReminder: isReschedule(order, changed) });
    if (!saved) throw new InstallationJobConflictError(JOB_CHANGED_MESSAGE);
    await this.audit(staff, updated, 'system.installation.updated', `${order.orderNumber} details updated`, {
      fields: Object.keys(changed),
      status: updated.status,
    });
    await this.notifier.notify({ type: 'job_updated', order: updated, stamp: now.toISOString() }, now);
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
