import { Injectable } from '@nestjs/common';
import {
  type StoredTenantOnboarding,
  type TenantOnboardingRepository,
} from './tenant-onboarding.repository';

@Injectable()
export class InMemoryTenantOnboardingRepository implements TenantOnboardingRepository {
  private readonly store = new Map<string, StoredTenantOnboarding>();

  async save(onboarding: StoredTenantOnboarding): Promise<void> {
    this.store.set(onboarding.tenantId, onboarding);
  }

  async findByTenantId(
    tenantId: string,
  ): Promise<StoredTenantOnboarding | null> {
    return this.store.get(tenantId) ?? null;
  }

  async findAll(): Promise<StoredTenantOnboarding[]> {
    return [...this.store.values()].sort(
      (left, right) => right.createdAt.getTime() - left.createdAt.getTime(),
    );
  }

  async deleteByTenantId(tenantId: string): Promise<void> {
    this.store.delete(tenantId);
  }
}
