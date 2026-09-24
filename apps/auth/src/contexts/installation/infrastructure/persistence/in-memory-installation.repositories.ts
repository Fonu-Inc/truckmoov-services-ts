import { Injectable } from '@nestjs/common';
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
import type {
  AssignmentOutcome,
  InstallationOrderRepository,
  InstallerJobCount,
  StoredDeviceAssignment,
  StoredInstallationOrder,
  UnassignedCursor,
} from '@auth/installation/domain/installation-order.repository';

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
