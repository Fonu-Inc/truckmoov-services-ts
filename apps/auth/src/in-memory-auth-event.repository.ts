import { Injectable } from '@nestjs/common';
import type { AuthEventFilters, AuthEventPage, AuthEventRepository, AuthEventStatus, AuthEventType, StoredAuthEvent } from './auth-event.repository';

@Injectable()
export class InMemoryAuthEventRepository implements AuthEventRepository {
  private readonly store = new Map<string, StoredAuthEvent>();

  async save(event: StoredAuthEvent): Promise<void> {
    this.store.set(event.id, event);
  }

  private matches(e: StoredAuthEvent, filters: AuthEventFilters): boolean {
    if (filters.tenantId && e.tenantId !== filters.tenantId) return false;
    if (filters.eventType && e.eventType !== filters.eventType) return false;
    if (filters.status && e.status !== filters.status) return false;
    if (filters.ipAddress && e.ipAddress !== filters.ipAddress) return false;
    if (filters.from && e.occurredAt < filters.from) return false;
    if (filters.to && e.occurredAt > filters.to) return false;
    if (filters.search) {
      const q = filters.search.toLowerCase();
      const hay = `${e.email ?? ''} ${e.ipAddress} ${e.tenantId ?? ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  }

  private page(items: StoredAuthEvent[], filters: AuthEventFilters): AuthEventPage {
    const sorted = items.sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());
    const offset = filters.offset ?? 0;
    const limit = filters.limit ?? sorted.length;
    return { items: sorted.slice(offset, offset + limit), total: sorted.length };
  }

  async search(filters: AuthEventFilters): Promise<AuthEventPage> {
    return this.page([...this.store.values()].filter((e) => this.matches(e, filters)), filters);
  }

  async searchFailedLogins(filters: AuthEventFilters): Promise<AuthEventPage> {
    return this.page(
      [...this.store.values()].filter(
        (e) => e.eventType === 'login' && e.status === 'failed' && this.matches(e, filters),
      ),
      filters,
    );
  }

  async countFailuresFromIp(ipAddress: string, since: Date): Promise<number> {
    return [...this.store.values()].filter(
      (e) =>
        e.ipAddress === ipAddress &&
        e.status === 'failed' &&
        (e.eventType === 'access' || (e.eventType === 'login' && e.failureReason !== 'account_locked' && e.failureReason !== 'mfa_failed')) &&
        e.occurredAt >= since,
    ).length;
  }

  async countSince(status: AuthEventStatus, eventType: AuthEventType, since: Date): Promise<number> {
    return [...this.store.values()].filter(
      (e) => e.status === status && e.eventType === eventType && e.occurredAt >= since,
    ).length;
  }

  async deleteOlderThan(cutoff: Date): Promise<number> {
    let removed = 0;
    for (const [id, e] of this.store) {
      if (e.occurredAt < cutoff) {
        this.store.delete(id);
        removed++;
      }
    }
    return removed;
  }
}
