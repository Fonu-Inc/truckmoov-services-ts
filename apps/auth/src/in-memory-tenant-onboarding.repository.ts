import { Injectable } from '@nestjs/common';
import {
  type PendingSubscriptionCharge,
  type StoredTenantOnboarding,
  type TenantOnboardingRepository,
} from './tenant-onboarding.repository';

@Injectable()
export class InMemoryTenantOnboardingRepository implements TenantOnboardingRepository {
  private readonly store = new Map<string, StoredTenantOnboarding>();

  async save(onboarding: StoredTenantOnboarding): Promise<void> {
    this.store.set(onboarding.tenantId, onboarding);
  }

  async appendPendingCharge(
    tenantId: string,
    charge: PendingSubscriptionCharge,
    maxPending: number,
  ): Promise<void> {
    const current = this.store.get(tenantId);
    if (!current) return;
    const earlier = current.subscription.pendingCharges ?? [];
    this.store.set(tenantId, {
      ...current,
      subscription: {
        ...current.subscription,
        pendingCharges: [...earlier, charge].slice(-maxPending),
      },
      updatedAt: new Date(),
    });
  }

  async activateSubscription(
    tenantId: string,
    charge: PendingSubscriptionCharge,
    activatedAt: Date,
  ): Promise<boolean> {
    const current = this.store.get(tenantId);
    if (!current) return false;
    const done =
      current.subscriptionActivatedAt && current.paymentReference === charge.reference;
    const plan = current.subscription.planCode;
    if (done || (plan && plan !== charge.planCode)) return false;
    const others = (current.subscription.pendingCharges ?? []).filter(
      (pending) => pending.reference !== charge.reference,
    );
    this.store.set(tenantId, {
      ...current,
      subscription: {
        planCode: charge.planCode,
        billingCycle: charge.billingCycle,
        ...(others.length ? { pendingCharges: others } : {}),
      },
      paymentReference: charge.reference,
      subscriptionActivatedAt: activatedAt,
      updatedAt: activatedAt,
    });
    return true;
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
