import { Inject, Injectable } from '@nestjs/common';
import {
  ACTIVE_JOB_STATUSES,
  buildOrderNumber,
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
import {
  INSTALLATION_ORDER_REPOSITORY,
  type AssignmentOutcome,
  type InstallationOrderRepository,
  type InstallerJobCount,
  type StoredChecklistTick,
  type StoredDeviceAssignment,
  type StoredInstallationEvidence,
  type StoredInstallationOrder,
  type UnassignedCursor,
} from '@auth/installation/domain/installation-order.repository';
import type { InstallationCompletion } from '@auth/installation/domain/ports/installation-completion.port';
import type { JobIssueRecord, JobIssueRecorder } from '@auth/installation/domain/ports/job-issue-recorder.port';
import { InMemorySupportTicketRepository } from '../../../../in-memory-support-ticket.repository';
import { InMemorySupportTicketAttachmentRepository } from '../../../../in-memory-support-ticket-attachment.repository';
import {
  ONBOARDING_APPLICATION_REPOSITORY,
  type OnboardingApplicationRepository,
} from '@auth/onboarding/domain/onboarding-application.repository';

function queueOrder(a: UnassignedCursor, b: UnassignedCursor): number {
  return (
    a.scheduledDate.getTime() - b.scheduledDate.getTime() ||
    a.createdAt.getTime() - b.createdAt.getTime() ||
    a.id.localeCompare(b.id)
  );
}

function matches(installer: StoredInstaller, filters: InstallerFilters): boolean {
  if (filters.status && installer.status !== filters.status) return false;
  const q = filters.search?.trim().toLowerCase();
  if (!q) return true;
  return [installer.fullName, installer.code, installer.email, ...installer.serviceAreas].some((field) =>
    field.toLowerCase().includes(q),
  );
}

@Injectable()
export class InMemoryInstallerRepository implements InstallerRepository {
  private readonly installers = new Map<string, StoredInstaller>();
  private sequence = 0;

  async save(installer: StoredInstaller): Promise<void> {
    this.installers.set(installer.id, { ...installer });
  }

  async findById(id: string): Promise<StoredInstaller | null> {
    return this.installers.get(id) ?? null;
  }

  async findByEmail(email: string): Promise<StoredInstaller | null> {
    return this.all().find((installer) => installer.email === email) ?? null;
  }

  async findByUserId(userId: string): Promise<StoredInstaller | null> {
    return this.all().find((installer) => installer.userId === userId) ?? null;
  }

  async findActive(): Promise<StoredInstaller[]> {
    return this.all().filter((installer) => installer.status === 'active');
  }

  async list(filters: InstallerFilters, page: InstallerPageRequest): Promise<InstallerPage> {
    const found = this.all()
      .filter((installer) => matches(installer, filters))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    const offset = (page.page - 1) * page.limit;
    return { items: found.slice(offset, offset + page.limit), total: found.length };
  }

  async countByStatus(): Promise<Record<InstallerStatus, number>> {
    const counts = Object.fromEntries(INSTALLER_STATUSES.map((s) => [s, 0])) as Record<InstallerStatus, number>;
    for (const installer of this.all()) counts[installer.status] += 1;
    return counts;
  }

  async nextCode(): Promise<string> {
    this.sequence += 1;
    return formatInstallerCode(this.sequence);
  }

  private all(): StoredInstaller[] {
    return [...this.installers.values()];
  }
}

@Injectable()
export class InMemoryInstallationOrderRepository
  implements InstallationOrderRepository
{
  private readonly orders = new Map<string, StoredInstallationOrder>();
  private readonly assignments = new Map<string, StoredDeviceAssignment[]>();
  private readonly ticks = new Map<string, StoredChecklistTick>();
  private readonly evidence = new Map<string, StoredInstallationEvidence>();
  private sequence = 999;

  async save(order: StoredInstallationOrder): Promise<void> {
    this.orders.set(order.id, { ...order });
  }

  async findUnassigned(limit: number, after?: UnassignedCursor): Promise<StoredInstallationOrder[]> {
    return this.all()
      .filter((order) => order.status === 'unassigned' && (!after || queueOrder(order, after) > 0))
      .sort(queueOrder)
      .slice(0, limit);
  }

  async assignIfRoom(order: StoredInstallationOrder, maxActiveJobs: number): Promise<AssignmentOutcome> {
    if (this.orders.get(order.id)?.status !== 'unassigned') return 'taken';
    const active = this.all().filter(
      (o) => o.installerId === order.installerId && ACTIVE_JOB_STATUSES.includes(o.status),
    ).length;
    if (active >= maxActiveJobs) return 'full';
    await this.save(order);
    return 'assigned';
  }

  async claimReminders(
    statuses: readonly InstallationOrderStatus[],
    day: Date,
    now: Date,
  ): Promise<StoredInstallationOrder[]> {
    const due = this.all().filter(
      (order) => statuses.includes(order.status) && order.scheduledDate.getTime() === day.getTime() && !order.reminderSentAt,
    );
    for (const order of due) await this.save({ ...order, reminderSentAt: now });
    return due.map((order) => ({ ...order, reminderSentAt: now }));
  }

  async markOverdue(
    from: readonly InstallationOrderStatus[],
    before: Date,
    now: Date,
  ): Promise<number> {
    const due = this.all().filter(
      (order) => from.includes(order.status) && order.scheduledDate.getTime() < before.getTime(),
    );
    for (const order of due) await this.save({ ...order, status: 'overdue', updatedAt: now });
    return due.length;
  }

  async transition(order: StoredInstallationOrder, from: InstallationOrderStatus): Promise<boolean> {
    const current = this.orders.get(order.id);
    if (current?.status !== from) return false;
    const { status, preExceptionStatus, assignedAt, acceptedAt, startedAt, issueReportedAt, completedAt, cancelledAt, updatedAt } = order;
    this.orders.set(order.id, {
      ...current, status, preExceptionStatus, assignedAt, acceptedAt, startedAt, issueReportedAt, completedAt, cancelledAt, updatedAt,
    });
    return true;
  }

  async saveDetails(
    order: StoredInstallationOrder,
    from: InstallationOrderStatus,
    options: { clearReminder?: boolean } = {},
  ): Promise<boolean> {
    const current = this.orders.get(order.id);
    if (current?.status !== from) return false;
    const reminderSentAt = options.clearReminder ? null : current.reminderSentAt;
    this.orders.set(order.id, { ...order, installerNotes: current.installerNotes, reminderSentAt });
    return true;
  }

  async saveInstallerNotes(
    orderId: string,
    notes: string | null,
    statuses: readonly InstallationOrderStatus[],
    now: Date,
  ): Promise<boolean> {
    const current = this.orders.get(orderId);
    if (!current || !statuses.includes(current.status)) return false;
    this.orders.set(orderId, { ...current, installerNotes: notes, updatedAt: now });
    return true;
  }

  async findTicks(orderId: string): Promise<StoredChecklistTick[]> {
    return [...this.ticks.values()]
      .filter((tick) => tick.orderId === orderId)
      .sort((a, b) => a.checkedAt.getTime() - b.checkedAt.getTime());
  }

  async saveTick(tick: StoredChecklistTick): Promise<void> {
    this.ticks.set(`${tick.orderId}:${tick.itemKey}`, { ...tick });
  }

  async deleteTick(orderId: string, itemKey: string): Promise<void> {
    this.ticks.delete(`${orderId}:${itemKey}`);
  }

  async saveEvidence(evidence: StoredInstallationEvidence): Promise<void> {
    this.evidence.set(evidence.id, { ...evidence });
  }

  async findEvidence(orderId: string): Promise<StoredInstallationEvidence[]> {
    return [...this.evidence.values()]
      .filter((item) => item.orderId === orderId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  async nextOrderNumber(): Promise<string> {
    this.sequence += 1;
    return buildOrderNumber(this.sequence);
  }

  /** Every order with its units, for the in-memory job reader. */
  snapshot(): Array<{ order: StoredInstallationOrder; assignments: StoredDeviceAssignment[] }> {
    return this.all().map((order) => ({
      order: { ...order },
      assignments: [...(this.assignments.get(order.id) ?? [])].sort((a, b) => a.deviceIndex - b.deviceIndex),
    }));
  }

  private all(): StoredInstallationOrder[] {
    return [...this.orders.values()];
  }

  async findById(id: string): Promise<StoredInstallationOrder | null> {
    return this.orders.get(id) ?? null;
  }

  async findByApplicationId(
    applicationId: string,
  ): Promise<StoredInstallationOrder | null> {
    return (
      [...this.orders.values()].find(
        (order) => order.applicationId === applicationId,
      ) ?? null
    );
  }

  async findByTenantId(
    tenantId: string,
  ): Promise<StoredInstallationOrder | null> {
    return (
      [...this.orders.values()].find((order) => order.tenantId === tenantId) ??
      null
    );
  }

  async replaceAssignments(
    orderId: string,
    assignments: StoredDeviceAssignment[],
  ): Promise<void> {
    this.assignments.set(
      orderId,
      assignments.map((assignment) => ({ ...assignment })),
    );
  }

  async findAssignments(orderId: string): Promise<StoredDeviceAssignment[]> {
    return [...(this.assignments.get(orderId) ?? [])].sort(
      (a, b) => a.deviceIndex - b.deviceIndex,
    );
  }

  async findAssignmentByFleetDeviceId(
    fleetDeviceId: string,
  ): Promise<StoredDeviceAssignment | null> {
    const found = [...this.assignments.values()].flat().find((a) => a.fleetDeviceId === fleetDeviceId);
    return found ? { ...found } : null;
  }

  async saveAssignment(assignment: StoredDeviceAssignment): Promise<void> {
    const holder = assignment.fleetDeviceId ? await this.findAssignmentByFleetDeviceId(assignment.fleetDeviceId) : null;
    if (holder && holder.id !== assignment.id) throw new DeviceAlreadyBoundError();
    const units = this.assignments.get(assignment.orderId) ?? [];
    this.assignments.set(
      assignment.orderId,
      units.map((unit) => (unit.id === assignment.id ? { ...assignment } : unit)),
    );
  }

  async deleteForApplication(applicationId: string): Promise<void> {
    const order = await this.findByApplicationId(applicationId);
    if (!order) return;
    for (const [key, tick] of this.ticks) if (tick.orderId === order.id) this.ticks.delete(key);
    for (const [id, item] of this.evidence) if (item.orderId === order.id) this.evidence.delete(id);
    this.assignments.delete(order.id);
    this.orders.delete(order.id);
  }

  async countByInstaller(installerIds: string[]): Promise<InstallerJobCount[]> {
    const counts = new Map<string, InstallerJobCount>();
    for (const order of this.orders.values()) {
      if (!order.installerId || !installerIds.includes(order.installerId)) continue;
      const key = `${order.installerId}:${order.status}`;
      const row = counts.get(key) ?? { installerId: order.installerId, status: order.status, count: 0 };
      counts.set(key, { ...row, count: row.count + 1 });
    }
    return [...counts.values()];
  }
}

@Injectable()
export class InMemoryInstallationCompletion implements InstallationCompletion {
  private readonly held = new Set<string>();

  constructor(
    @Inject(INSTALLATION_ORDER_REPOSITORY) private readonly orders: InstallationOrderRepository,
    @Inject(ONBOARDING_APPLICATION_REPOSITORY) private readonly applications: OnboardingApplicationRepository,
  ) {}

  async complete(
    completed: StoredInstallationOrder,
    from: InstallationOrderStatus,
    handOver: () => Promise<void>,
  ): Promise<boolean> {
    if (this.held.has(completed.id)) return false;
    this.held.add(completed.id);
    try {
      return await this.completeHeld(completed, from, handOver);
    } finally {
      this.held.delete(completed.id);
    }
  }

  private async completeHeld(
    completed: StoredInstallationOrder,
    from: InstallationOrderStatus,
    handOver: () => Promise<void>,
  ): Promise<boolean> {
    const [order, application] = await Promise.all([
      this.orders.findById(completed.id),
      this.applications.findById(completed.applicationId),
    ]);
    if (order?.status !== from || application?.stage !== 'installation') return false;
    await handOver();
    await this.orders.transition(completed, from);
    await this.applications.save({ ...application, stage: 'connectivity_verification', updatedAt: completed.updatedAt });
    return true;
  }
}

/** A failed write undoes the others, as the transaction would. */
@Injectable()
export class InMemoryJobIssueRecorder implements JobIssueRecorder {
  constructor(
    @Inject(INSTALLATION_ORDER_REPOSITORY) private readonly orders: InstallationOrderRepository,
    @Inject(InMemorySupportTicketRepository) private readonly tickets: InMemorySupportTicketRepository,
    @Inject(InMemorySupportTicketAttachmentRepository) private readonly attachments: InMemorySupportTicketAttachmentRepository,
  ) {}

  async record(issue: JobIssueRecord): Promise<boolean> {
    const before = await this.orders.findById(issue.order.id);
    if (!before || !(await this.orders.transition(issue.order, issue.from))) return false;
    try {
      await this.tickets.save(issue.ticket);
      if (issue.attachment) await this.attachments.save(issue.attachment);
      return true;
    } catch (error) {
      await this.rollBack(issue, before);
      throw error;
    }
  }

  private async rollBack(issue: JobIssueRecord, before: StoredInstallationOrder): Promise<void> {
    await this.tickets.remove(issue.ticket.id);
    if (issue.attachment) await this.attachments.remove(issue.attachment.id);
    await this.orders.save(before);
  }
}
