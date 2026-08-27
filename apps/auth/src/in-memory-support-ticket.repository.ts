import { Injectable } from '@nestjs/common';
import type { StoredSupportTicket, SupportTicketFilters, SupportTicketRepository } from './support-ticket.repository';

@Injectable()
export class InMemorySupportTicketRepository implements SupportTicketRepository {
  private readonly store = new Map<string, StoredSupportTicket>();

  async findAll(filters?: SupportTicketFilters): Promise<StoredSupportTicket[]> {
    let results = [...this.store.values()];
    if (filters?.status) results = results.filter((t) => t.status === filters.status);
    if (filters?.category) results = results.filter((t) => t.category === filters.category);
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
      counts.set(t.tenantId, (counts.get(t.tenantId) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([tenantId, count]) => ({ tenantId, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
  }
}
