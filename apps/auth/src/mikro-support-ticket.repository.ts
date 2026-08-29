import { Inject, Injectable } from '@nestjs/common';
import { AppConfigService } from '@shared/config';
import {
  getAuthOrm,
  SupportTicketRecord,
} from './contexts/auth/session/infrastructure/persistence/auth-orm';
import type {
  StoredSupportTicket,
  SupportTicketFilters,
  SupportTicketRepository,
} from './support-ticket.repository';

function toStored(r: SupportTicketRecord): StoredSupportTicket {
  return {
    id: r.id,
    tenantId: r.tenantId,
    category: r.category,
    subject: r.subject,
    description: r.description,
    status: r.status,
    priority: r.priority,
    channel: r.channel,
    otherChannel: r.otherChannel,
    contextType: r.contextType,
    contextId: r.contextId,
    contextSnapshot: r.contextSnapshot,
    escalatedTo: r.escalatedTo,
    escalatedReferenceId: r.escalatedReferenceId,
    escalationNotes: r.escalationNotes,
    escalatedAt: r.escalatedAt,
    escalatedBy: r.escalatedBy,
    assignedTo: r.assignedTo,
    createdBy: r.createdBy,
    resolvedAt: r.resolvedAt,
    closedAt: r.closedAt,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

@Injectable()
export class MikroSupportTicketRepository implements SupportTicketRepository {
  constructor(@Inject(AppConfigService) private readonly config: AppConfigService) {}

  async findAll(filters?: SupportTicketFilters): Promise<StoredSupportTicket[]> {
    const orm = await getAuthOrm(this.config.db);
    const em = orm.em.fork();

    if (filters?.search) {
      const q = `%${filters.search}%`;
      const conditions: string[] = ['(subject ilike ? or description ilike ? or id ilike ? or tenant_id ilike ?)'];
      const params: unknown[] = [q, q, q, q];
      if (filters.status) { conditions.push('status = ?'); params.push(filters.status); }
      if (filters.category) { conditions.push('category = ?'); params.push(filters.category); }
      if (filters.priority) { conditions.push('priority = ?'); params.push(filters.priority); }
      const rows = await orm.em.getConnection().execute<SupportTicketRecord[]>(
        `select * from support_tickets where ${conditions.join(' and ')} order by created_at desc`,
        params,
      );
      return rows.map((r) => toStored(r as unknown as SupportTicketRecord));
    }

    const where: Record<string, unknown> = {};
    if (filters?.status) where.status = filters.status;
    if (filters?.category) where.category = filters.category;
    if (filters?.priority) where.priority = filters.priority;
    const records = await em.find(SupportTicketRecord, where, { orderBy: { createdAt: 'desc' } });
    return records.map(toStored);
  }

  async findAllForTenant(tenantId: string, filters?: SupportTicketFilters): Promise<StoredSupportTicket[]> {
    const orm = await getAuthOrm(this.config.db);
    const em = orm.em.fork();

    const where: Record<string, unknown> = { tenantId };
    if (filters?.status) where.status = filters.status;
    if (filters?.category) where.category = filters.category;
    if (filters?.priority) where.priority = filters.priority;
    const records = await em.find(SupportTicketRecord, where, { orderBy: { createdAt: 'desc' } });

    if (!filters?.search) return records.map(toStored);
    const q = filters.search.toLowerCase();
    return records
      .filter((r) => r.subject.toLowerCase().includes(q) || r.description.toLowerCase().includes(q) || r.id.toLowerCase().includes(q))
      .map(toStored);
  }

  async findById(id: string): Promise<StoredSupportTicket | null> {
    const orm = await getAuthOrm(this.config.db);
    const em = orm.em.fork();
    const record = await em.findOne(SupportTicketRecord, { id });
    return record ? toStored(record) : null;
  }

  async save(ticket: StoredSupportTicket): Promise<void> {
    const orm = await getAuthOrm(this.config.db);
    const em = orm.em.fork();
    await em.upsert(SupportTicketRecord, ticket as unknown as SupportTicketRecord);
  }

  async countByStatus(): Promise<Record<string, number>> {
    const orm = await getAuthOrm(this.config.db);
    const rows = await orm.em.getConnection().execute<Array<{ status: string; count: string }>>(
      'select status, count(*)::int as count from support_tickets group by status',
    );
    const counts: Record<string, number> = {};
    for (const row of rows) counts[row.status] = Number(row.count);
    return counts;
  }

  async countByStatusForTenant(tenantId: string): Promise<Record<string, number>> {
    const orm = await getAuthOrm(this.config.db);
    const rows = await orm.em.getConnection().execute<Array<{ status: string; count: string }>>(
      'select status, count(*)::int as count from support_tickets where tenant_id = ? group by status',
      [tenantId],
    );
    const counts: Record<string, number> = {};
    for (const row of rows) counts[row.status] = Number(row.count);
    return counts;
  }

  async countByCategory(): Promise<Record<string, number>> {
    const orm = await getAuthOrm(this.config.db);
    const rows = await orm.em.getConnection().execute<Array<{ category: string; count: string }>>(
      'select category, count(*)::int as count from support_tickets group by category',
    );
    const counts: Record<string, number> = {};
    for (const row of rows) counts[row.category] = Number(row.count);
    return counts;
  }

  async countResolvedToday(): Promise<number> {
    const orm = await getAuthOrm(this.config.db);
    const rows = await orm.em.getConnection().execute<Array<{ count: string }>>(
      `select count(*)::int as count from support_tickets where status = 'resolved' and resolved_at >= current_date`,
    );
    return Number(rows[0]?.count ?? 0);
  }

  async countByTenant(): Promise<Array<{ tenantId: string; count: number }>> {
    const orm = await getAuthOrm(this.config.db);
    const rows = await orm.em.getConnection().execute<Array<{ tenant_id: string; count: string }>>(
      'select tenant_id, count(*)::int as count from support_tickets group by tenant_id order by count desc limit 8',
    );
    return rows.map((r) => ({ tenantId: r.tenant_id, count: Number(r.count) }));
  }
}
