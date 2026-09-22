import { Injectable } from '@nestjs/common';
import type {
  InstallerRepository,
  StoredInstaller,
} from '@auth/installation/domain/installer.repository';
import type {
  InstallationOrderRepository,
  StoredDeviceAssignment,
  StoredInstallationOrder,
} from '@auth/installation/domain/installation-order.repository';

@Injectable()
export class InMemoryInstallerRepository implements InstallerRepository {
  private readonly installers = new Map<string, StoredInstaller>();

  async save(installer: StoredInstaller): Promise<void> {
    this.installers.set(installer.id, { ...installer });
  }

  async findById(id: string): Promise<StoredInstaller | null> {
    return this.installers.get(id) ?? null;
  }

  async findActive(): Promise<StoredInstaller[]> {
    return [...this.installers.values()].filter(
      (installer) => installer.isActive,
    );
  }

  async findActiveInState(state: string): Promise<StoredInstaller[]> {
    const wanted = state.trim().toLowerCase();
    return (await this.findActive()).filter(
      (installer) => installer.state.toLowerCase() === wanted,
    );
  }
}

@Injectable()
export class InMemoryInstallationOrderRepository
  implements InstallationOrderRepository
{
  private readonly orders = new Map<string, StoredInstallationOrder>();
  private readonly assignments = new Map<string, StoredDeviceAssignment[]>();

  async save(order: StoredInstallationOrder): Promise<void> {
    this.orders.set(order.id, { ...order });
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

  async deleteForApplication(applicationId: string): Promise<void> {
    const order = await this.findByApplicationId(applicationId);
    if (!order) return;
    this.assignments.delete(order.id);
    this.orders.delete(order.id);
  }
}
