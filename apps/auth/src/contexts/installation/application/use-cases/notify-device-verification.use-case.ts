import { Inject, Injectable } from '@nestjs/common';
import { TERMINAL_JOB_STATUSES } from '@auth/installation/domain/installation-order';
import type { NotifiedDevice } from '@auth/installation/domain/installer-notification';
import {
  INSTALLATION_ORDER_REPOSITORY,
  type InstallationOrderRepository,
  type StoredInstallationOrder,
} from '@auth/installation/domain/installation-order.repository';
import { InstallerNotifier } from '../services/installer-notifier.service';

export type DeviceVerificationOutcome = 'verified' | 'failed';

export type DeviceVerificationEvent = {
  eventId: string;
  tenantId: string;
  deviceId: string;
  outcome: DeviceVerificationOutcome;
  device: NotifiedDevice;
  reason?: string;
};

/** Tells the installer on the device's open job how fleet's verification went. */
@Injectable()
export class NotifyDeviceVerificationUseCase {
  constructor(
    @Inject(INSTALLATION_ORDER_REPOSITORY) private readonly orders: InstallationOrderRepository,
    @Inject(InstallerNotifier) private readonly notifier: InstallerNotifier,
  ) {}

  /** False when the device is on no open job with an installer. */
  async execute(event: DeviceVerificationEvent): Promise<boolean> {
    const order = await this.openJobFor(event);
    if (!order) return false;
    await this.notifier.deliver({
      type: event.outcome === 'verified' ? 'device_verified' : 'device_verification_failed',
      order,
      stamp: event.eventId,
      device: event.device,
      reason: event.reason,
    });
    return true;
  }

  private async openJobFor(event: DeviceVerificationEvent): Promise<StoredInstallationOrder | null> {
    const unit = await this.orders.findAssignmentByFleetDeviceId(event.deviceId);
    const order = unit ? await this.orders.findById(unit.orderId) : null;
    if (!order?.installerId || order.tenantId !== event.tenantId) return null;
    return TERMINAL_JOB_STATUSES.includes(order.status) ? null : order;
  }
}
