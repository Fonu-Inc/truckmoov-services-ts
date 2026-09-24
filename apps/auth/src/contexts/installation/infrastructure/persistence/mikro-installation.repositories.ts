import { Inject, Injectable } from '@nestjs/common';
import { UniqueConstraintViolationException, raw, type FilterQuery } from '@mikro-orm/core';
import { AppConfigService } from '@shared/config';
import { getAuthOrm } from '@auth/session/infrastructure/persistence/auth-orm';
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
import {
  InstallationDeviceAssignmentRecord,
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
    siteContactName: r.siteContactName,
    siteContactPhone: r.siteContactPhone,
    notes: r.notes ?? null,
    installerId: r.installerId ?? null,
    status: r.status as StoredInstallationOrder['status'],
    preExceptionStatus: (r.preExceptionStatus ?? null) as StoredInstallationOrder['preExceptionStatus'],
    assignedAt: r.assignedAt ?? null,
    acceptedAt: r.acceptedAt ?? null,
    startedAt: r.startedAt ?? null,
    completedAt: r.completedAt ?? null,
    cancelledAt: r.cancelledAt ?? null,
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
      const [row] = await tx.execute<Array<{ count: number }>>(
        `select count(*)::int as count from installation_orders where installer_id = ? and status in (?)`,
        [order.installerId, [...ACTIVE_JOB_STATUSES]],
      );
      if (Number(row?.count ?? 0) >= maxActiveJobs) return 'full';
      const { id, ...fields } = order;
      const changed = await tx.nativeUpdate(InstallationOrderRecord, { id, status: 'unassigned' }, fields);
      return changed > 0 ? 'assigned' : 'taken';
    });
  }

  async markOverdue(
    from: readonly InstallationOrderStatus[],
    before: Date,
    now: Date,
  ): Promise<number> {
    if (from.length === 0) return 0;
    const em = await this.em();
    return em.nativeUpdate(
      InstallationOrderRecord,
      { status: { $in: [...from] }, scheduledDate: { $lt: before } },
      { status: 'overdue', updatedAt: now },
    );
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

    await em.nativeDelete(InstallationDeviceAssignmentRecord, {
      orderId: order.id,
    });
    await em.nativeDelete(InstallationOrderRecord, { id: order.id });
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
