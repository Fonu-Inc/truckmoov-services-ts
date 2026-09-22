import { Inject, Injectable } from '@nestjs/common';
import { AppConfigService } from '@shared/config';
import { getAuthOrm } from '@auth/session/infrastructure/persistence/auth-orm';
import type {
  InstallerRepository,
  StoredInstaller,
} from '@auth/installation/domain/installer.repository';
import type {
  InstallationOrderRepository,
  StoredDeviceAssignment,
  StoredInstallationOrder,
} from '@auth/installation/domain/installation-order.repository';
import {
  InstallationDeviceAssignmentRecord,
  InstallationOrderRecord,
  InstallerRecord,
} from './installation-orm';

function toStoredInstaller(r: InstallerRecord): StoredInstaller {
  return {
    id: r.id,
    fullName: r.fullName,
    email: r.email,
    phoneNumber: r.phoneNumber,
    team: r.team,
    state: r.state,
    isActive: r.isActive,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
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
    completedAt: r.completedAt ?? null,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
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
    const em = await this.em();
    const record = await em.findOne(InstallerRecord, { id });
    return record ? toStoredInstaller(record) : null;
  }

  async findActive(): Promise<StoredInstaller[]> {
    const em = await this.em();
    const records = await em.find(InstallerRecord, { isActive: true });
    return records.map(toStoredInstaller);
  }

  async findActiveInState(state: string): Promise<StoredInstaller[]> {
    const em = await this.em();
    const records = await em.find(InstallerRecord, {
      isActive: true,
      state: state.trim(),
    });
    return records.map(toStoredInstaller);
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
    return records.map((record) => ({
      id: record.id,
      orderId: record.orderId,
      deviceIndex: record.deviceIndex,
      vehicleId: record.vehicleId,
      createdAt: record.createdAt,
    }));
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
}
