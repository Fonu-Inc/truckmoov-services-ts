import { Inject, Injectable } from '@nestjs/common';
import {
  INSTALLATION_ORDER_REPOSITORY,
  type InstallationOrderRepository,
} from '@auth/installation/domain/installation-order.repository';
import type {
  InstallerNotificationRepository,
  InstallerNotificationRow,
  NotificationPage,
  NotificationPageRequest,
  StoredInstallerNotification,
} from '@auth/installation/domain/installer-notification.repository';

function newestFirst(a: StoredInstallerNotification, b: StoredInstallerNotification): number {
  return b.createdAt.getTime() - a.createdAt.getTime() || b.id.localeCompare(a.id);
}

@Injectable()
export class InMemoryInstallerNotificationRepository implements InstallerNotificationRepository {
  private readonly rows = new Map<string, StoredInstallerNotification>();

  constructor(@Inject(INSTALLATION_ORDER_REPOSITORY) private readonly orders: InstallationOrderRepository) {}

  async add(notification: StoredInstallerNotification): Promise<boolean> {
    if (this.all().some((row) => row.dedupeKey === notification.dedupeKey)) return false;
    this.rows.set(notification.id, { ...notification });
    return true;
  }

  async list(installerId: string, request: NotificationPageRequest): Promise<NotificationPage> {
    const found = this.inbox(installerId).filter((row) => !request.unreadOnly || !row.readAt).sort(newestFirst);
    const offset = (request.page - 1) * request.limit;
    const items = await Promise.all(found.slice(offset, offset + request.limit).map((row) => this.withJobNumber(row)));
    return { items, total: found.length };
  }

  async countUnread(installerId: string): Promise<number> {
    return this.inbox(installerId).filter((row) => !row.readAt).length;
  }

  async markRead(installerId: string, id: string, now: Date): Promise<boolean> {
    const row = this.rows.get(id);
    if (row?.installerId !== installerId) return false;
    this.rows.set(id, { ...row, readAt: row.readAt ?? now });
    return true;
  }

  async markAllRead(installerId: string, now: Date): Promise<number> {
    const unread = this.inbox(installerId).filter((row) => !row.readAt);
    for (const row of unread) this.rows.set(row.id, { ...row, readAt: now });
    return unread.length;
  }

  private async withJobNumber(row: StoredInstallerNotification): Promise<InstallerNotificationRow> {
    const order = row.orderId ? await this.orders.findById(row.orderId) : null;
    return { ...row, jobNumber: order?.orderNumber ?? null };
  }

  private inbox(installerId: string): StoredInstallerNotification[] {
    return this.all().filter((row) => row.installerId === installerId);
  }

  private all(): StoredInstallerNotification[] {
    return [...this.rows.values()];
  }
}
