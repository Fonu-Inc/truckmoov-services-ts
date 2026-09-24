import { Injectable } from '@nestjs/common';
import {
  searchedTicketNumber,
  type StoredSupportTicket,
  type SupportTicketFilters,
  type SupportTicketRepository,
  type TicketPageRequest,
  type TicketReporter,
} from './support-ticket.repository';

function newestFirst(a: StoredSupportTicket, b: StoredSupportTicket): number {
  return b.createdAt.getTime() - a.createdAt.getTime() || a.id.localeCompare(b.id);
}

function reporterMatches(ticket: StoredSupportTicket, search?: string): boolean {
  const q = search?.trim().toLowerCase();
  if (!q) return true;
  const number = searchedTicketNumber(q);
  return ticket.subject.toLowerCase().includes(q) || ticket.description.toLowerCase().includes(q) || ticket.ticketNumber === number;
}

@Injectable()
export class InMemorySupportTicketRepository implements SupportTicketRepository {
  private readonly store = new Map<string, StoredSupportTicket>();
  private sequence = 999;

  async findAll(filters?: SupportTicketFilters): Promise<StoredSupportTicket[]> {
    let results = [...this.store.values()];
    if (filters?.status) results = results.filter((t) => t.status === filters.status);
    if (filters?.category) results = results.filter((t) => t.category === filters.category);
    if (filters?.priority) results = results.filter((t) => t.priority === filters.priority);
    if (filters?.reporterType) results = results.filter((t) => t.reporterType === filters.reporterType);
    if (filters?.search) {
      const q = filters.search.toLowerCase();
      results = results.filter(
        (t) =>
          t.subject.toLowerCase().includes(q) ||
          t.description.toLowerCase().includes(q) ||
          t.id.toLowerCase().includes(q) ||
          t.tenantId.toLowerCase().includes(q),
      );
    }
    return results.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async findAllForTenant(tenantId: string, filters?: SupportTicketFilters): Promise<StoredSupportTicket[]> {
    const all = await this.findAll(filters);
    return all.filter((t) => t.tenantId === tenantId);
  }

  async findById(id: string): Promise<StoredSupportTicket | null> {
    return this.store.get(id) ?? null;
  }

  async save(ticket: StoredSupportTicket): Promise<void> {
    this.store.set(ticket.id, ticket);
  }

  async remove(id: string): Promise<void> {
    this.store.delete(id);
  }

  async countByStatus(): Promise<Record<string, number>> {
    const counts: Record<string, number> = {};
    for (const t of this.store.values()) {
      counts[t.status] = (counts[t.status] ?? 0) + 1;
    }
    return counts;
  }

  async countByStatusForTenant(tenantId: string): Promise<Record<string, number>> {
    const counts: Record<string, number> = {};
    for (const t of this.store.values()) {
      if (t.tenantId !== tenantId) continue;
      counts[t.status] = (counts[t.status] ?? 0) + 1;
    }
    return counts;
  }

  async countByCategory(): Promise<Record<string, number>> {
    const counts: Record<string, number> = {};
    for (const t of this.store.values()) {
      counts[t.category] = (counts[t.category] ?? 0) + 1;
    }
    return counts;
  }

  async countResolvedToday(): Promise<number> {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    return [...this.store.values()].filter(
      (t) => t.status === 'resolved' && t.resolvedAt && t.resolvedAt >= startOfDay,
    ).length;
  }

  async countByTenant(): Promise<Array<{ tenantId: string; count: number }>> {
    const counts = new Map<string, number>();
    for (const t of this.store.values()) {
      if (t.reporterType === 'tenant_user') counts.set(t.tenantId, (counts.get(t.tenantId) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([tenantId, count]) => ({ tenantId, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
  }

  async nextTicketNumber(): Promise<number> {
    this.sequence += 1;
    return this.sequence;
  }

  async findForReporter(
    reporter: TicketReporter,
    filters: SupportTicketFilters,
    page: TicketPageRequest,
  ): Promise<{ items: StoredSupportTicket[]; total: number }> {
    const found = this.reportedBy(reporter)
      .filter((t) => !filters.status || t.status === filters.status)
      .filter((t) => !filters.category || t.category === filters.category)
      .filter((t) => !filters.priority || t.priority === filters.priority)
      .filter((t) => reporterMatches(t, filters.search))
      .sort(newestFirst);
    const offset = (page.page - 1) * page.limit;
    return { items: found.slice(offset, offset + page.limit), total: found.length };
  }

  async countByStatusForReporter(reporter: TicketReporter): Promise<Record<string, number>> {
    const counts: Record<string, number> = {};
    for (const t of this.reportedBy(reporter)) counts[t.status] = (counts[t.status] ?? 0) + 1;
    return counts;
  }

  async findByRelatedOrders(orderIds: string[], contextType?: string): Promise<StoredSupportTicket[]> {
    return [...this.store.values()]
      .filter((t) => t.relatedOrderId !== null && orderIds.includes(t.relatedOrderId))
      .filter((t) => !contextType || t.contextType === contextType)
      .sort(newestFirst);
  }

  private reportedBy(reporter: TicketReporter): StoredSupportTicket[] {
    return [...this.store.values()].filter((t) => t.reporterType === reporter.type && t.reporterId === reporter.id);
  }
}
