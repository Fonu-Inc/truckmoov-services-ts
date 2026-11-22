import { Inject, Injectable } from '@nestjs/common';
import { AppConfigService } from '@shared/config';
import { getAuthOrm } from '@auth/session/infrastructure/persistence/auth-orm';
import type {
  AdminNotificationPageRequest,
  AdminNotificationRepository,
  AdminNotificationRow,
  StoredAdminNotification,
} from './admin-notification.repository';

type Row = Record<string, unknown>;

function toRow(row: Row): AdminNotificationRow {
  return {
    id: String(row.id),
    eventId: String(row.event_id),
    alertType: row.alert_type as AdminNotificationRow['alertType'],
    severity: row.severity as AdminNotificationRow['severity'],
    title: String(row.title),
    body: String(row.body ?? ''),
    createdAt: new Date(row.created_at as string),
    readAt: row.read_at ? new Date(row.read_at as string) : null,
  };
}

@Injectable()
export class MikroAdminNotificationRepository implements AdminNotificationRepository {
  constructor(@Inject(AppConfigService) private readonly config: AppConfigService) {}

  async add(n: StoredAdminNotification): Promise<boolean> {
    const rows = await (await this.connection()).execute(
      `insert into admin_notifications (id, event_id, alert_type, severity, title, body, created_at)
       values (?, ?, ?, ?, ?, ?, ?)
       on conflict (event_id) do nothing
       returning id`,
      [n.id, n.eventId, n.alertType, n.severity, n.title, n.body, n.createdAt],
    );
    return rows.length > 0;
  }

  async list(userId: string, request: AdminNotificationPageRequest) {
    const connection = await this.connection();
    const unread = request.unreadOnly ? 'where r.read_at is null' : '';
    const rows = await connection.execute<Row[]>(
      `select n.*, r.read_at
         from admin_notifications n
         left join admin_notification_reads r on r.notification_id = n.id and r.user_id = ?
         ${unread}
        order by n.created_at desc, n.id desc
        limit ? offset ?`,
      [userId, request.limit, (request.page - 1) * request.limit],
    );
    const [count] = await connection.execute<Array<{ total: number }>>(
      `select count(*)::int as total
         from admin_notifications n
         left join admin_notification_reads r on r.notification_id = n.id and r.user_id = ?
         ${unread}`,
      [userId],
    );
    return { items: rows.map(toRow), total: Number(count?.total ?? 0) };
  }

  async countUnread(userId: string): Promise<number> {
    const [count] = await (await this.connection()).execute<Array<{ total: number }>>(
      `select count(*)::int as total
         from admin_notifications n
        where not exists (select 1 from admin_notification_reads r where r.notification_id = n.id and r.user_id = ?)`,
      [userId],
    );
    return Number(count?.total ?? 0);
  }

  async markRead(userId: string, id: string, now: Date): Promise<boolean> {
    const rows = await (await this.connection()).execute(
      `insert into admin_notification_reads (notification_id, user_id, read_at)
       select n.id, ?, ? from admin_notifications n where n.id = ?
       on conflict (notification_id, user_id) do update set read_at = admin_notification_reads.read_at
       returning notification_id`,
      [userId, now, id],
    );
    return rows.length > 0;
  }

  async markAllRead(userId: string, now: Date): Promise<number> {
    const rows = await (await this.connection()).execute(
      `insert into admin_notification_reads (notification_id, user_id, read_at)
       select n.id, ?, ? from admin_notifications n
       on conflict (notification_id, user_id) do nothing
       returning notification_id`,
      [userId, now],
    );
    return rows.length;
  }

  private async connection() {
    return (await getAuthOrm(this.config.db)).em.fork().getConnection();
  }
}
