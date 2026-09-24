import type { InstallerNotificationType } from './installer-notification';

export type StoredInstallerNotification = {
  id: string;
  installerId: string;
  type: InstallerNotificationType;
  title: string;
  body: string;
  orderId: string | null;
  dedupeKey: string;
  createdAt: Date;
  readAt: Date | null;
};

export type InstallerNotificationRow = StoredInstallerNotification & { jobNumber: string | null };

export type NotificationPageRequest = { unreadOnly: boolean; page: number; limit: number };
export type NotificationPage = { items: InstallerNotificationRow[]; total: number };

export interface InstallerNotificationRepository {
  /** False when a row with the same dedupe key already exists. */
  add(notification: StoredInstallerNotification): Promise<boolean>;
  /** Newest first. */
  list(installerId: string, request: NotificationPageRequest): Promise<NotificationPage>;
  countUnread(installerId: string): Promise<number>;
  /** False when the installer has no such notification. */
  markRead(installerId: string, id: string, now: Date): Promise<boolean>;
  markAllRead(installerId: string, now: Date): Promise<number>;
}

export const INSTALLER_NOTIFICATION_REPOSITORY = Symbol('INSTALLER_NOTIFICATION_REPOSITORY');
