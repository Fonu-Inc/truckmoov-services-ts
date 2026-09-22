import { Injectable } from '@nestjs/common';
import type {
  M2mLicensePlanRepository,
  StoredM2mLicensePlan,
} from '@auth/onboarding/domain/m2m-license-plan.repository';

@Injectable()
export class InMemoryM2mLicensePlanRepository
  implements M2mLicensePlanRepository
{
  private readonly plans = new Map<string, StoredM2mLicensePlan>();

  async save(plan: StoredM2mLicensePlan): Promise<void> {
    this.plans.set(plan.id, { ...plan });
  }

  async findByCode(code: string): Promise<StoredM2mLicensePlan | null> {
    return (
      [...this.plans.values()].find((plan) => plan.code === code) ?? null
    );
  }

  async findActive(): Promise<StoredM2mLicensePlan[]> {
    return [...this.plans.values()]
      .filter((plan) => plan.isActive)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }
}
