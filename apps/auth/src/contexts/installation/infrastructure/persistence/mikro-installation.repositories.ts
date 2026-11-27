import { Inject, Injectable } from '@nestjs/common';
import { UniqueConstraintViolationException, raw, type FilterQuery } from '@mikro-orm/core';
import type { EntityManager } from '@mikro-orm/postgresql';
import { AppConfigService } from '@shared/config';
import { nextCalendarDay } from '@shared/devices';
import {
  getAuthOrm,
  SupportTicketAttachmentRecord,
  SupportTicketRecord,
} from '@auth/session/infrastructure/persistence/auth-orm';
import {
  ACTIVE_JOB_STATUSES,
  buildOrderNumber,
  TERMINAL_JOB_STATUSES,
  type InstallationOrderStatus,
} from '@auth/installation/domain/installation-order';
import { DeviceAlreadyBoundError } from '@auth/installation/domain/installation-job.errors';
import {
  INSTALLER_STATUSES,
  formatInstallerCode,
  type InstallerStatus,
} from '@auth/installation/domain/installer';
import type {
  InstallerFilters,
  InstallerPage,
  InstallerPageRequest,
  InstallerRepository,
  StoredInstaller,
} from '@auth/installation/domain/installer.repository';
import type {
  AssignmentOutcome,
  InstallationOrderRepository,
  InstallerJobCount,
  StoredChecklistTick,
  StoredDeviceAssignment,
  StoredInstallationEvidence,
  StoredInstallationFeedback,
  StoredInstallationOrder,
  StoredOfferRejection,
  UnassignedCursor,
} from '@auth/installation/domain/installation-order.repository';
import type { InstallationCompletion } from '@auth/installation/domain/ports/installation-completion.port';
import type { JobIssueRecord, JobIssueRecorder } from '@auth/installation/domain/ports/job-issue-recorder.port';
import { OnboardingApplicationRecord } from '@auth/onboarding/infrastructure/persistence/onboarding-orm';
import {
  InstallationChecklistTickRecord,
  InstallationDeviceAssignmentRecord,
  InstallationEvidenceRecord,
  InstallationFeedbackRecord,
  InstallationOfferRejectionRecord,
  InstallationOrderRecord,
  InstallerRecord,
} from './installation-orm';

function toStoredInstaller(r: InstallerRecord): StoredInstaller {
  return {
    id: r.id,
    userId: r.userId ?? null,
    code: r.code,
    firstName: r.firstName,
    lastName: r.lastName,
    fullName: r.fullName,
    email: r.email,
    phoneNumber: r.phoneNumber,
    team: r.team,
    state: r.state ?? null,
    city: r.city ?? null,
    serviceAreas: r.serviceAreas ?? [],
    capabilities: (r.capabilities ?? []) as StoredInstaller['capabilities'],
    photoKey: r.photoKey ?? null,
    notificationPreferences: (r.notificationPreferences ?? null) as StoredInstaller['notificationPreferences'],
    displayPreferences: (r.displayPreferences ?? null) as StoredInstaller['displayPreferences'],
    workPreferences: (r.workPreferences ?? null) as StoredInstaller['workPreferences'],
    status: r.status as InstallerStatus,
    maxActiveJobs: r.maxActiveJobs,
    lastActivityAt: r.lastActivityAt ?? null,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

function installerWhere(filters: InstallerFilters): FilterQuery<InstallerRecord> {
  const where: FilterQuery<InstallerRecord> = filters.status ? { status: filters.status } : {};
  const q = filters.search?.trim();
  if (!q) return where;
  const pattern = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  return {
    ...where,
    $or: [
      { fullName: { $ilike: pattern } },
      { code: { $ilike: pattern } },
      { email: { $ilike: pattern } },
      { [raw(`array_to_string(service_areas, ' ')`)]: { $ilike: pattern } },
    ],
  };
}

function toStoredOrder(r: InstallationOrderRecord): StoredInstallationOrder {
  return {
    id: r.id,
    orderNumber: r.orderNumber,
    applicationId: r.applicationId,
    tenantId: r.tenantId,
    scheduledDate: r.scheduledDate,
    timeSlot: r.timeSlot as StoredInstallationOrder['timeSlot'],
    addressLine: r.addressLine,
    city: r.city,
    state: r.state,
    requiredCapabilities: (r.requiredCapabilities?.length ? r.requiredCapabilities : ['device_installation']) as StoredInstallationOrder['requiredCapabilities'],
    siteContactName: r.siteContactName,
    siteContactPhone: r.siteContactPhone,
    notes: r.notes ?? null,
    installerNotes: r.installerNotes ?? null,
    installerId: r.installerId ?? null,
    status: r.status as StoredInstallationOrder['status'],
    preExceptionStatus: (r.preExceptionStatus ?? null) as StoredInstallationOrder['preExceptionStatus'],
    assignedAt: r.assignedAt ?? null,
    acceptedAt: r.acceptedAt ?? null,
    startedAt: r.startedAt ?? null,
    issueReportedAt: r.issueReportedAt ?? null,
    completedAt: r.completedAt ?? null,
    cancelledAt: r.cancelledAt ?? null,
    reminderSentAt: r.reminderSentAt ?? null,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

function unassignedAfter(cursor?: UnassignedCursor): FilterQuery<InstallationOrderRecord> {
  if (!cursor) return { status: 'unassigned' };
  const { scheduledDate, createdAt, id } = cursor;
  return {
    status: 'unassigned',
    $or: [
      { scheduledDate: { $gt: scheduledDate } },
      { scheduledDate, createdAt: { $gt: createdAt } },
      { scheduledDate, createdAt, id: { $gt: id } },
    ],
  };
}

function toStoredAssignment(r: InstallationDeviceAssignmentRecord): StoredDeviceAssignment {
  return {
    id: r.id,
    orderId: r.orderId,
    deviceIndex: r.deviceIndex,
    vehicleId: r.vehicleId,
    fleetDeviceId: r.fleetDeviceId ?? null,
    createdAt: r.createdAt,
  };
}

function toStoredTick(r: InstallationChecklistTickRecord): StoredChecklistTick {
  return { orderId: r.orderId, itemKey: r.itemKey, checkedAt: r.checkedAt, checkedBy: r.checkedBy };
}

function toStoredEvidence(r: InstallationEvidenceRecord): StoredInstallationEvidence {
  return {
    id: r.id,
    orderId: r.orderId,
    category: r.category as StoredInstallationEvidence['category'],
    fileKey: r.fileKey,
    fileHash: r.fileHash,
    fileSize: Number(r.fileSize),
    mimeType: r.mimeType,
    uploadedBy: r.uploadedBy,
    createdAt: r.createdAt,
  };
}

/** Only what a status move changes, so a move never overwrites notes written alongside it. */
function transitionFields(order: StoredInstallationOrder) {
  const { status, preExceptionStatus, assignedAt, acceptedAt, startedAt, issueReportedAt, completedAt, cancelledAt, updatedAt } = order;
  return { status, preExceptionStatus, assignedAt, acceptedAt, startedAt, issueReportedAt, completedAt, cancelledAt, updatedAt };
}

function detailFields(order: StoredInstallationOrder) {
  const { scheduledDate, timeSlot, addressLine, city, state, siteContactName, siteContactPhone } = order;
  return { scheduledDate, timeSlot, addressLine, city, state, siteContactName, siteContactPhone };
}

abstract class MikroBase {
  constructor(
    @Inject(AppConfigService) protected readonly config: AppConfigService,
  ) {}

  protected async em() {
    const orm = await getAuthOrm(this.config.db);
    return orm.em.fork();
  }
}

@Injectable()
export class MikroInstallerRepository
  extends MikroBase
  implements InstallerRepository
{
  async save(installer: StoredInstaller): Promise<void> {
    const em = await this.em();
    const existing = await em.findOne(InstallerRecord, { id: installer.id });
    const target = existing ?? new InstallerRecord();
    Object.assign(target, installer);
    if (!existing) em.persist(target);
    await em.flush();
  }

  async findById(id: string): Promise<StoredInstaller | null> {
    return this.findOne({ id });
  }

  async findByEmail(email: string): Promise<StoredInstaller | null> {
    return this.findOne({ email });
  }

  async findByUserId(userId: string): Promise<StoredInstaller | null> {
    return this.findOne({ userId });
  }

  async findActive(): Promise<StoredInstaller[]> {
    const em = await this.em();
    const records = await em.find(InstallerRecord, { status: 'active' });
    return records.map(toStoredInstaller);
  }

  async list(filters: InstallerFilters, page: InstallerPageRequest): Promise<InstallerPage> {
    const em = await this.em();
    // A raw() key is spent once used, so each query gets its own filter.
    const records = await em.find(InstallerRecord, installerWhere(filters), {
      orderBy: { createdAt: 'desc', id: 'asc' },
      limit: page.limit,
      offset: (page.page - 1) * page.limit,
    });
    const total = await em.count(InstallerRecord, installerWhere(filters));
    return { items: records.map(toStoredInstaller), total };
  }

  async countByStatus(): Promise<Record<InstallerStatus, number>> {
    const em = await this.em();
    const rows = await em
      .getConnection()
      .execute<Array<{ status: string; count: number }>>(
        `select status, count(*)::int as count from installers group by status`,
      );
    const counts = Object.fromEntries(INSTALLER_STATUSES.map((s) => [s, 0])) as Record<InstallerStatus, number>;
    for (const row of rows) {
      if (row.status in counts) counts[row.status as InstallerStatus] = Number(row.count);
    }
    return counts;
  }

  async nextCode(): Promise<string> {
    const em = await this.em();
    const [row] = await em
      .getConnection()
      .execute<Array<{ value: string }>>(`select nextval('installer_code_seq') as value`);
    return formatInstallerCode(Number(row.value));
  }

  private async findOne(where: FilterQuery<InstallerRecord>): Promise<StoredInstaller | null> {
    const em = await this.em();
    const record = await em.findOne(InstallerRecord, where);
    return record ? toStoredInstaller(record) : null;
  }
}

@Injectable()
export class MikroInstallationOrderRepository
  extends MikroBase
  implements InstallationOrderRepository
{
  async save(order: StoredInstallationOrder): Promise<void> {
    const em = await this.em();
    const existing = await em.findOne(InstallationOrderRecord, { id: order.id });
    const target = existing ?? new InstallationOrderRecord();
    Object.assign(target, order);
    if (!existing) em.persist(target);
    await em.flush();
  }

  async findById(id: string): Promise<StoredInstallationOrder | null> {
    const em = await this.em();
    const record = await em.findOne(InstallationOrderRecord, { id });
    return record ? toStoredOrder(record) : null;
  }

  async findUnassigned(limit: number, cursor?: UnassignedCursor): Promise<StoredInstallationOrder[]> {
    const em = await this.em();
    const records = await em.find(
      InstallationOrderRecord,
      unassignedAfter(cursor),
      { orderBy: { scheduledDate: 'asc', createdAt: 'asc', id: 'asc' }, limit },
    );
    return records.map(toStoredOrder);
  }

  async assignIfRoom(order: StoredInstallationOrder, maxActiveJobs: number): Promise<AssignmentOutcome> {
    const em = await this.em();
    return em.transactional(async (tx) => {
      await tx.execute(`select id from installers where id = ? for update`, [order.installerId]);
      const declined = await tx.count(InstallationOfferRejectionRecord, { orderId: order.id, installerId: order.installerId! });
      if (declined > 0) return 'declined';
      const [row] = await tx.execute<Array<{ count: number }>>(
        `select count(*)::int as count from installation_orders where installer_id = ? and status in (?)`,
        [order.installerId, [...ACTIVE_JOB_STATUSES]],
      );
      if (Number(row?.count ?? 0) >= maxActiveJobs) return 'full';
      const [slot] = await tx.execute<Array<{ count: number }>>(
        `select count(*)::int as count
         from installation_orders
         where installer_id = ?
           and scheduled_date = ?
           and time_slot = ?
           and status in (?)`,
        [
          order.installerId,
          order.scheduledDate,
          order.timeSlot,
          [...ACTIVE_JOB_STATUSES],
        ],
      );
      if (Number(slot?.count ?? 0) > 0) return 'conflict';
      const changed = await tx.nativeUpdate(
        InstallationOrderRecord,
        { id: order.id, status: 'unassigned', scheduledDate: order.scheduledDate, timeSlot: order.timeSlot },
        { ...transitionFields(order), installerId: order.installerId },
      );
      return changed > 0 ? 'assigned' : 'taken';
    });
  }

  async rejectOffer(order: StoredInstallationOrder, rejection: StoredOfferRejection): Promise<boolean> {
    const em = await this.em();
    return em.transactional(async (tx) => {
      const changed = await tx.nativeUpdate(
        InstallationOrderRecord,
        { id: order.id, status: 'assigned', installerId: rejection.installerId },
        { ...transitionFields(order), installerId: null },
      );
      if (changed === 0) return false;
      await tx.execute(
        `insert into installation_offer_rejections (order_id, installer_id, reason, rejected_at) values (?, ?, ?, ?)
         on conflict (order_id, installer_id) do update set reason = excluded.reason, rejected_at = excluded.rejected_at`,
        [rejection.orderId, rejection.installerId, rejection.reason, rejection.rejectedAt],
      );
      return true;
    });
  }

  async findOfferRejections(orderIds: string[]): Promise<StoredOfferRejection[]> {
    if (orderIds.length === 0) return [];
    const em = await this.em();
    const records = await em.find(
      InstallationOfferRejectionRecord,
      { orderId: { $in: orderIds } },
      { orderBy: { rejectedAt: 'asc', installerId: 'asc' } },
    );
    return records.map((r) => ({ orderId: r.orderId, installerId: r.installerId, reason: r.reason, rejectedAt: r.rejectedAt }));
  }

  async claimReminders(
    statuses: readonly InstallationOrderStatus[],
    day: Date,
    now: Date,
  ): Promise<StoredInstallationOrder[]> {
    if (statuses.length === 0) return [];
    const em = await this.em();
    const claimed = await em.getConnection().execute<Array<{ id: string }>>(
      `update installation_orders set reminder_sent_at = ?
        where status in (?) and scheduled_date >= ? and scheduled_date < ? and reminder_sent_at is null
        returning id`,
      [now, [...statuses], day, nextCalendarDay(day)],
    );
    if (claimed.length === 0) return [];
    const records = await em.find(InstallationOrderRecord, { id: { $in: claimed.map((row) => row.id) } });
    return records.map(toStoredOrder);
  }

  async markOverdue(
    from: readonly InstallationOrderStatus[],
    before: Date,
    now: Date,
  ): Promise<StoredInstallationOrder[]> {
    if (from.length === 0) return [];
    const em = await this.em();
    const due = await em.find(InstallationOrderRecord, { status: { $in: [...from] }, scheduledDate: { $lt: before } });
    const moved: StoredInstallationOrder[] = [];
    for (const record of due) {
      // One conditional write per order, so replicas sweeping together each move an order once.
      const changed = await em.nativeUpdate(
        InstallationOrderRecord,
        { id: record.id, status: record.status },
        { status: 'overdue', updatedAt: now },
      );
      if (changed > 0) moved.push({ ...toStoredOrder(record), status: 'overdue', updatedAt: now });
    }
    return moved;
  }

  async transition(order: StoredInstallationOrder, from: InstallationOrderStatus): Promise<boolean> {
    const em = await this.em();
    const changed = await em.nativeUpdate(InstallationOrderRecord, { id: order.id, status: from }, transitionFields(order));
    return changed > 0;
  }

  async saveDetails(
    order: StoredInstallationOrder,
    from: InstallationOrderStatus,
    options: { clearReminder?: boolean } = {},
  ): Promise<boolean> {
    const em = await this.em();
    const reminder = options.clearReminder ? { reminderSentAt: null } : {};
    const changed = await em.nativeUpdate(
      InstallationOrderRecord,
      { id: order.id, status: from },
      { ...detailFields(order), ...transitionFields(order), ...reminder },
    );
    return changed > 0;
  }

  async saveInstallerNotes(
    orderId: string,
    notes: string | null,
    statuses: readonly InstallationOrderStatus[],
    now: Date,
  ): Promise<boolean> {
    const em = await this.em();
    const changed = await em.nativeUpdate(
      InstallationOrderRecord,
      { id: orderId, status: { $in: [...statuses] } },
      { installerNotes: notes, updatedAt: now },
    );
    return changed > 0;
  }

  async findTicks(orderId: string): Promise<StoredChecklistTick[]> {
    const em = await this.em();
    const records = await em.find(InstallationChecklistTickRecord, { orderId }, { orderBy: { checkedAt: 'asc' } });
    return records.map(toStoredTick);
  }

  async saveTick(tick: StoredChecklistTick): Promise<void> {
    const em = await this.em();
    await em.getConnection().execute(
      `insert into installation_checklist_ticks (order_id, item_key, checked_at, checked_by)
       values (?, ?, ?, ?)
       on conflict (order_id, item_key) do update set checked_at = excluded.checked_at, checked_by = excluded.checked_by`,
      [tick.orderId, tick.itemKey, tick.checkedAt, tick.checkedBy],
    );
  }

  async deleteTick(orderId: string, itemKey: string): Promise<void> {
    const em = await this.em();
    await em.nativeDelete(InstallationChecklistTickRecord, { orderId, itemKey });
  }

  async saveEvidence(evidence: StoredInstallationEvidence): Promise<void> {
    const em = await this.em();
    em.persist(Object.assign(new InstallationEvidenceRecord(), evidence));
    await em.flush();
  }

  async findEvidence(orderId: string): Promise<StoredInstallationEvidence[]> {
    const em = await this.em();
    const records = await em.find(InstallationEvidenceRecord, { orderId }, { orderBy: { createdAt: 'asc', id: 'asc' } });
    return records.map(toStoredEvidence);
  }

  async deleteEvidence(orderId: string, evidenceId: string): Promise<boolean> {
    const em = await this.em();
    return (await em.nativeDelete(InstallationEvidenceRecord, { orderId, id: evidenceId })) > 0;
  }

  async nextOrderNumber(): Promise<string> {
    const em = await this.em();
    const [row] = await em
      .getConnection()
      .execute<Array<{ value: string }>>(`select nextval('installation_order_number_seq') as value`);
    return buildOrderNumber(Number(row.value));
  }

  async findByApplicationId(
    applicationId: string,
  ): Promise<StoredInstallationOrder | null> {
    const em = await this.em();
    const record = await em.findOne(InstallationOrderRecord, { applicationId });
    return record ? toStoredOrder(record) : null;
  }

  async findByTenantId(
    tenantId: string,
  ): Promise<StoredInstallationOrder | null> {
    const em = await this.em();
    const record = await em.findOne(InstallationOrderRecord, { tenantId });
    return record ? toStoredOrder(record) : null;
  }

  async findOpenByTenantId(
    tenantId: string,
  ): Promise<StoredInstallationOrder | null> {
    const em = await this.em();
    const record = await em.findOne(
      InstallationOrderRecord,
      { tenantId, status: { $nin: [...TERMINAL_JOB_STATUSES] } },
      { orderBy: { createdAt: 'desc', id: 'asc' } },
    );
    return record ? toStoredOrder(record) : null;
  }

  async replaceAssignments(
    orderId: string,
    assignments: StoredDeviceAssignment[],
  ): Promise<void> {
    const em = await this.em();
    await em.nativeDelete(InstallationDeviceAssignmentRecord, { orderId });

    for (const assignment of assignments) {
      const record = new InstallationDeviceAssignmentRecord();
      Object.assign(record, assignment);
      em.persist(record);
    }
    await em.flush();
  }

  async findAssignments(orderId: string): Promise<StoredDeviceAssignment[]> {
    const em = await this.em();
    const records = await em.find(
      InstallationDeviceAssignmentRecord,
      { orderId },
      { orderBy: { deviceIndex: 'asc' } },
    );
    return records.map(toStoredAssignment);
  }

  async findAssignmentByFleetDeviceId(
    fleetDeviceId: string,
  ): Promise<StoredDeviceAssignment | null> {
    const em = await this.em();
    const record = await em.findOne(InstallationDeviceAssignmentRecord, { fleetDeviceId });
    return record ? toStoredAssignment(record) : null;
  }

  async saveAssignment(assignment: StoredDeviceAssignment): Promise<void> {
    const em = await this.em();
    const { id, ...fields } = assignment;
    try {
      await em.nativeUpdate(InstallationDeviceAssignmentRecord, { id }, fields);
    } catch (error) {
      if (error instanceof UniqueConstraintViolationException) throw new DeviceAlreadyBoundError();
      throw error;
    }
  }

  async deleteForApplication(applicationId: string): Promise<void> {
    const em = await this.em();
    const order = await em.findOne(InstallationOrderRecord, { applicationId });
    if (!order) return;

    await em.nativeDelete(InstallationChecklistTickRecord, { orderId: order.id });
    await em.nativeDelete(InstallationEvidenceRecord, { orderId: order.id });
    await em.nativeDelete(InstallationOfferRejectionRecord, { orderId: order.id });
    await em.nativeDelete(InstallationFeedbackRecord, { orderId: order.id });
    await em.nativeDelete(InstallationDeviceAssignmentRecord, {
      orderId: order.id,
    });
    await em.nativeDelete(InstallationOrderRecord, { id: order.id });
  }

  async saveFeedback(feedback: StoredInstallationFeedback): Promise<boolean> {
    const em = await this.em();
    const inserted = await em.getConnection().execute<Array<{ order_id: string }>>(
      `insert into installation_feedback (order_id, rating, comment, submitted_at, submitted_by) values (?, ?, ?, ?, ?)
       on conflict (order_id) do nothing returning order_id`,
      [feedback.orderId, feedback.rating, feedback.comment, feedback.submittedAt, feedback.submittedBy],
    );
    return inserted.length > 0;
  }

  async findFeedback(orderId: string): Promise<StoredInstallationFeedback | null> {
    const em = await this.em();
    const r = await em.findOne(InstallationFeedbackRecord, { orderId });
    return r ? { orderId: r.orderId, rating: r.rating, comment: r.comment ?? null, submittedAt: r.submittedAt, submittedBy: r.submittedBy } : null;
  }

  async countByInstaller(installerIds: string[]): Promise<InstallerJobCount[]> {
    if (installerIds.length === 0) return [];
    const em = await this.em();
    const rows = await em.getConnection().execute<
      Array<{ installer_id: string; status: string; count: number }>
    >(
      `select installer_id, status, count(*)::int as count
         from installation_orders
        where installer_id in (?)
        group by installer_id, status`,
      [installerIds],
    );
    return rows.map((row) => ({
      installerId: row.installer_id,
      status: row.status as InstallerJobCount['status'],
      count: Number(row.count),
    }));
  }
}

@Injectable()
export class MikroInstallationCompletion extends MikroBase implements InstallationCompletion {
  async complete(
    completed: StoredInstallationOrder,
    from: InstallationOrderStatus,
    handOver: () => Promise<void>,
  ): Promise<boolean> {
    const em = await this.em();
    return em.transactional(async (tx) => {
      if (!(await this.hold(tx, completed, from))) return false;
      await handOver();
      await tx.nativeUpdate(InstallationOrderRecord, { id: completed.id }, transitionFields(completed));
      await tx.nativeUpdate(
        OnboardingApplicationRecord,
        { id: completed.applicationId },
        { stage: 'connectivity_verification', updatedAt: completed.updatedAt },
      );
      return true;
    });
  }

  /** skip locked: a second completion of the same order is refused at once rather than queued. */
  private async hold(tx: EntityManager, order: StoredInstallationOrder, from: InstallationOrderStatus): Promise<boolean> {
    const orders = await tx.execute(
      `select id from installation_orders where id = ? and status = ? for update skip locked`,
      [order.id, from],
    );
    if (orders.length === 0) return false;
    const applications = await tx.execute(
      `select id from onboarding_applications where id = ? and stage = 'installation' for update`,
      [order.applicationId],
    );
    return applications.length > 0;
  }
}

@Injectable()
export class MikroJobIssueRecorder extends MikroBase implements JobIssueRecorder {
  async record(issue: JobIssueRecord): Promise<boolean> {
    const em = await this.em();
    return em.transactional(async (tx) => {
      const moved = await tx.nativeUpdate(
        InstallationOrderRecord,
        { id: issue.order.id, status: issue.from },
        transitionFields(issue.order),
      );
      if (moved === 0) return false;
      await tx.insert(SupportTicketRecord, issue.ticket as unknown as SupportTicketRecord);
      if (issue.attachment) {
        await tx.insert(SupportTicketAttachmentRecord, issue.attachment as unknown as SupportTicketAttachmentRecord);
      }
      return true;
    });
  }
}
