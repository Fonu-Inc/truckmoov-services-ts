import { Inject, Injectable } from '@nestjs/common';
import { AppConfigService } from '@shared/config';
import { getAuthOrm } from '@auth/session/infrastructure/persistence/auth-orm';
import type {
  InstallerNotificationRepository,
  InstallerNotificationRow,
  NotificationPage,
  NotificationPageRequest,
  StoredInstallerNotification,
} from '@auth/installation/domain/installer-notification.repository';
import { InstallerNotificationRecord } from './installation-orm';

type Row = Record<string, unknown>;

function toRow(row: Row): InstallerNotificationRow {
  return {
    id: String(row.id),
    installerId: String(row.installer_id),
    type: row.type as InstallerNotificationRow['type'],
    title: String(row.title),
    body: String(row.body),
    orderId: (row.order_id as string | null) ?? null,
    dedupeKey: String(row.dedupe_key),
    createdAt: new Date(row.created_at as string),
    readAt: row.read_at ? new Date(row.read_at as string) : null,
    hidden: Boolean(row.hidden),
    jobNumber: (row.order_number as string | null) ?? null,
  };
}

function inboxWhere(installerId: string, unreadOnly: boolean): { sql: string; params: unknown[] } {
  return { sql: `n.installer_id = ? and not n.hidden${unreadOnly ? ' and n.read_at is null' : ''}`, params: [installerId] };
}

@Injectable()
export class MikroInstallerNotificationRepository implements InstallerNotificationRepository {
  constructor(@Inject(AppConfigService) private readonly config: AppConfigService) {}

  async add(n: StoredInstallerNotification): Promise<boolean> {
    const rows = await (await this.connection()).execute(
      `insert into installer_notifications (id, installer_id, type, title, body, order_id, dedupe_key, created_at, read_at, hidden)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       on conflict (dedupe_key) do nothing
       returning id`,
      [n.id, n.installerId, n.type, n.title, n.body, n.orderId, n.dedupeKey, n.createdAt, n.readAt, n.hidden],
    );
    return rows.length > 0;
  }

  async list(installerId: string, request: NotificationPageRequest): Promise<NotificationPage> {
    const connection = await this.connection();
    const where = inboxWhere(installerId, request.unreadOnly);
    const rows = await connection.execute<Row[]>(
      `select n.*, o.order_number
         from installer_notifications n
         left join installation_orders o on o.id = n.order_id
        where ${where.sql}
        order by n.created_at desc, n.id desc
        limit ? offset ?`,
      [...where.params, request.limit, (request.page - 1) * request.limit],
    );
    const [count] = await connection.execute<Array<{ total: number }>>(
      `select count(*)::int as total from installer_notifications n where ${where.sql}`,
      where.params,
    );
    return { items: rows.map(toRow), total: Number(count?.total ?? 0) };
  }

  async countUnread(installerId: string): Promise<number> {
    const em = await this.em();
    return em.count(InstallerNotificationRecord, { installerId, readAt: null, hidden: false });
  }

  async markRead(installerId: string, id: string, now: Date): Promise<boolean> {
    const em = await this.em();
    const mine = { id, installerId, hidden: false };
    const changed = await em.nativeUpdate(InstallerNotificationRecord, { ...mine, readAt: null }, { readAt: now });
    return changed > 0 || (await em.count(InstallerNotificationRecord, mine)) > 0;
  }

  async markAllRead(installerId: string, now: Date): Promise<number> {
    const em = await this.em();
    return em.nativeUpdate(InstallerNotificationRecord, { installerId, readAt: null, hidden: false }, { readAt: now });
  }

  private async em() {
    return (await getAuthOrm(this.config.db)).em.fork();
  }

  private async connection() {
    return (await this.em()).getConnection();
  }
}
