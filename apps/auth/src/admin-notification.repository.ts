import type { AlertSeverity, PlatformAlertType } from './platform-alert-settings.repository';

/** A platform alert delivered to the admin portal's notification centre. */
export type StoredAdminNotification = {
  id: string;
  /** The raised alert's event id; one notification per alert however often it is delivered. */
  eventId: string;
  alertType: PlatformAlertType;
  severity: AlertSeverity;
  title: string;
  body: string;
  createdAt: Date;
};

/** Shared by every admin; read state is per admin. */
export type AdminNotificationRow = StoredAdminNotification & { readAt: Date | null };

export type AdminNotificationPageRequest = { unreadOnly: boolean; page: number; limit: number };

export interface AdminNotificationRepository {
  /** False when the event was already recorded. */
  add(notification: StoredAdminNotification): Promise<boolean>;
  /** Newest first, with this admin's read state. */
  list(userId: string, request: AdminNotificationPageRequest): Promise<{ items: AdminNotificationRow[]; total: number }>;
  countUnread(userId: string): Promise<number>;
  /** False when no such notification exists. */
  markRead(userId: string, id: string, now: Date): Promise<boolean>;
  markAllRead(userId: string, now: Date): Promise<number>;
}

export const ADMIN_NOTIFICATION_REPOSITORY = Symbol('ADMIN_NOTIFICATION_REPOSITORY');
