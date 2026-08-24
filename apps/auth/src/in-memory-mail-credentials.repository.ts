import { Injectable } from '@nestjs/common';
import type {
  MailCredentialsRepository,
  StoredMailCredentials,
} from './mail-credentials.repository';

@Injectable()
export class InMemoryMailCredentialsRepository implements MailCredentialsRepository {
  private readonly byTenant = new Map<string, StoredMailCredentials>();

  async findByTenant(tenantId: string): Promise<StoredMailCredentials | null> {
    return this.byTenant.get(tenantId) ?? null;
  }

  async listConnectedTenantIds(): Promise<string[]> {
    return [...this.byTenant.keys()];
  }

  async save(credentials: StoredMailCredentials): Promise<void> {
    this.byTenant.set(credentials.tenantId, { ...credentials });
  }

  async delete(tenantId: string): Promise<void> {
    this.byTenant.delete(tenantId);
  }

  async recordVerification(
    tenantId: string,
    verifiedAt: Date | null,
    error: string | null,
  ): Promise<void> {
    const existing = this.byTenant.get(tenantId);
    if (!existing) return;
    this.byTenant.set(tenantId, {
      ...existing,
      lastVerifiedAt: verifiedAt?.toISOString() ?? null,
      lastError: error,
    });
  }
}
