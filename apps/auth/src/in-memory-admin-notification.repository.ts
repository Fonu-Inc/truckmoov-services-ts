import { Injectable } from '@nestjs/common';
import type {
  AdminNotificationPageRequest,
  AdminNotificationRepository,
  AdminNotificationRow,
  StoredAdminNotification,
} from './admin-notification.repository';

@Injectable()
export class InMemoryAdminNotificationRepository implements AdminNotificationRepository {
  private readonly notifications: StoredAdminNotification[] = [];
  private readonly reads = new Map<string, Date>();

  async add(n: StoredAdminNotification): Promise<boolean> {
    if (this.notifications.some((x) => x.eventId === n.eventId)) return false;
    this.notifications.push({ ...n });
    return true;
  }

  async list(userId: string, request: AdminNotificationPageRequest) {
    const rows = this.rowsFor(userId).filter((row) => !request.unreadOnly || !row.readAt);
    const offset = (request.page - 1) * request.limit;
    return { items: rows.slice(offset, offset + request.limit), total: rows.length };
  }

  async countUnread(userId: string): Promise<number> {
    return this.rowsFor(userId).filter((row) => !row.readAt).length;
  }

  async markRead(userId: string, id: string, now: Date): Promise<boolean> {
    if (!this.notifications.some((n) => n.id === id)) return false;
    const key = `${id}|${userId}`;
    if (!this.reads.has(key)) this.reads.set(key, now);
    return true;
  }

  async markAllRead(userId: string, now: Date): Promise<number> {
    let changed = 0;
    for (const n of this.notifications) {
      const key = `${n.id}|${userId}`;
      if (!this.reads.has(key)) {
        this.reads.set(key, now);
        changed++;
      }
    }
    return changed;
  }

  private rowsFor(userId: string): AdminNotificationRow[] {
    return this.notifications
      .map((n) => ({ ...n, readAt: this.reads.get(`${n.id}|${userId}`) ?? null }))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id.localeCompare(a.id));
  }
}
