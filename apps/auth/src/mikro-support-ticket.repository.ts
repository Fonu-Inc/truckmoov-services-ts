import { Inject, Injectable } from '@nestjs/common';
import type { ObjectQuery } from '@mikro-orm/core';
import { AppConfigService } from '@shared/config';
import {
  getAuthOrm,
  SupportTicketRecord,
} from './contexts/auth/session/infrastructure/persistence/auth-orm';
import {
  matchesTenantSearch,
  searchedTicketNumber,
  statusList,
  type StoredSupportTicket,
  type SupportTicketFilters,
  type SupportTicketRepository,
  type TicketPageRequest,
  type TicketReporter,
} from './support-ticket.repository';

function toStored(r: SupportTicketRecord): StoredSupportTicket {
  return {
    id: r.id,
    ticketNumber: Number(r.ticketNumber),
    tenantId: r.tenantId,
    reporterType: r.reporterType as StoredSupportTicket['reporterType'],
    reporterId: r.reporterId ?? null,
    relatedTenantId: r.relatedTenantId ?? null,
    relatedOrderId: r.relatedOrderId ?? null,
    issueCode: r.issueCode ?? null,
    callbackPhone: r.callbackPhone ?? null,
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

function escapeLike(value: string): string {
  return value.trim().replace(/[\\%_]/g, (c) => `\\${c}`);
}

function likePattern(search: string): string {
  return `%${escapeLike(search)}%`;
}

function fieldFilters(filters: SupportTicketFilters): ObjectQuery<SupportTicketRecord> {
  const where: Record<string, unknown> = {};
  const statuses = statusList(filters.status);
  if (statuses.length) where.status = { $in: statuses };
  if (filters.category) where.category = filters.category;
  if (filters.priority) where.priority = filters.priority;
  if (filters.reporterType) where.reporterType = filters.reporterType;
  if (filters.createdBy) where.createdBy = filters.createdBy;
  // $and so it never collides with a search $or spread alongside.
  if (filters.channel) {
    where.$and = [{ $or: [{ channel: filters.channel }, { otherChannel: { $ilike: escapeLike(filters.channel) } }] }];
  }
  return where;
}

function adminSearch(search: string): ObjectQuery<SupportTicketRecord> {
  const q = likePattern(search);
  return {
    $or: [{ subject: { $ilike: q } }, { description: { $ilike: q } }, { id: { $ilike: q } }, { tenantId: { $ilike: q } }],
  };
}

/** SQL form of matchesTenantSearch. */
function tenantSearch(search: string): ObjectQuery<SupportTicketRecord> {
  const q = likePattern(search);
  const number = searchedTicketNumber(search);
  const byText: ObjectQuery<SupportTicketRecord>[] = [{ subject: { $ilike: q } }, { description: { $ilike: q } }, { id: { $ilike: q } }];
  return { $or: number === null ? byText : [...byText, { ticketNumber: number }] };
}

function reporterSearch(search: string): ObjectQuery<SupportTicketRecord> {
  const q = likePattern(search);
  const number = searchedTicketNumber(search);
  const byText: ObjectQuery<SupportTicketRecord>[] = [{ subject: { $ilike: q } }, { description: { $ilike: q } }];
  return { $or: number === null ? byText : [...byText, { ticketNumber: number }] };
}

@Injectable()
export class MikroSupportTicketRepository implements SupportTicketRepository {
  constructor(@Inject(AppConfigService) private readonly config: AppConfigService) {}

  async findAll(filters: SupportTicketFilters = {}): Promise<StoredSupportTicket[]> {
    const em = await this.em();
    const where = filters.search?.trim() ? { ...fieldFilters(filters), ...adminSearch(filters.search) } : fieldFilters(filters);
    const records = await em.find(SupportTicketRecord, where, { orderBy: { createdAt: 'desc' } });
    return records.map(toStored);
  }

  async findAllForTenant(tenantId: string, filters?: SupportTicketFilters): Promise<StoredSupportTicket[]> {
    const orm = await getAuthOrm(this.config.db);
    const em = orm.em.fork();

    const where = { ...fieldFilters({ ...filters, reporterType: undefined }), tenantId };
    const records = await em.find(SupportTicketRecord, where, { orderBy: { createdAt: 'desc' } });

    if (!filters?.search) return records.map(toStored);
    return records.map(toStored).filter((t) => matchesTenantSearch(t, filters.search!));
  }

  async findPageForTenant(
    tenantId: string,
    filters: SupportTicketFilters,
    page: TicketPageRequest,
  ): Promise<{ items: StoredSupportTicket[]; total: number }> {
    const em = await this.em();
    const where: ObjectQuery<SupportTicketRecord> = {
      ...fieldFilters({ ...filters, reporterType: undefined }),
      tenantId,
      ...(filters.search?.trim() ? tenantSearch(filters.search) : {}),
    };
    const [records, total] = await em.findAndCount(SupportTicketRecord, where, {
      orderBy: { createdAt: 'desc', id: 'asc' },
      limit: page.limit,
      offset: (page.page - 1) * page.limit,
    });
    return { items: records.map(toStored), total };
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
      `select tenant_id, count(*)::int as count from support_tickets where reporter_type = 'tenant_user'
       group by tenant_id order by count desc limit 8`,
    );
    return rows.map((r) => ({ tenantId: r.tenant_id, count: Number(r.count) }));
  }

  async nextTicketNumber(): Promise<number> {
    const em = await this.em();
    const [row] = await em
      .getConnection()
      .execute<Array<{ value: string }>>(`select nextval('support_ticket_number_seq') as value`);
    return Number(row.value);
  }

  async findForReporter(
    reporter: TicketReporter,
    filters: SupportTicketFilters,
    page: TicketPageRequest,
  ): Promise<{ items: StoredSupportTicket[]; total: number }> {
    const em = await this.em();
    const where: ObjectQuery<SupportTicketRecord> = {
      ...fieldFilters(filters),
      reporterType: reporter.type,
      reporterId: reporter.id,
      ...(filters.search?.trim() ? reporterSearch(filters.search) : {}),
    };
    const [records, total] = await em.findAndCount(SupportTicketRecord, where, {
      orderBy: { createdAt: 'desc', id: 'asc' },
      limit: page.limit,
      offset: (page.page - 1) * page.limit,
    });
    return { items: records.map(toStored), total };
  }

  async countByStatusForReporter(reporter: TicketReporter): Promise<Record<string, number>> {
    const em = await this.em();
    const rows = await em.getConnection().execute<Array<{ status: string; count: number }>>(
      'select status, count(*)::int as count from support_tickets where reporter_type = ? and reporter_id = ? group by status',
      [reporter.type, reporter.id],
    );
    return Object.fromEntries(rows.map((row) => [row.status, Number(row.count)]));
  }

  async findByRelatedOrders(orderIds: string[], contextType?: string): Promise<StoredSupportTicket[]> {
    if (orderIds.length === 0) return [];
    const em = await this.em();
    const where: ObjectQuery<SupportTicketRecord> = {
      relatedOrderId: { $in: orderIds },
      ...(contextType ? { contextType } : {}),
    };
    const records = await em.find(SupportTicketRecord, where, { orderBy: { createdAt: 'desc', id: 'asc' } });
    return records.map(toStored);
  }

  private async em() {
    const orm = await getAuthOrm(this.config.db);
    return orm.em.fork();
  }
}
