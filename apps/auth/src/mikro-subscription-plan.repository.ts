import { Inject, Injectable } from '@nestjs/common';
import { AppConfigService } from '@shared/config';
import {
  getAuthOrm,
  SystemSubscriptionPlanRecord,
} from './contexts/auth/session/infrastructure/persistence/auth-orm';
import {
  type StoredSubscriptionPlan,
  type SubscriptionPlanRepository,
  type SubscriptionPlanTier,
} from './subscription-plan.repository';

function toStored(record: SystemSubscriptionPlanRecord): StoredSubscriptionPlan {
  return {
    id: record.id,
    code: record.code,
    tier: record.tier as SubscriptionPlanTier,
    name: record.name,
    description: record.description,
    monthlyPriceNgn: record.monthlyPriceNgn,
    yearlyMonthlyEquivalentNgn: record.yearlyMonthlyEquivalentNgn,
    yearlyDiscountPercent: record.yearlyDiscountPercent,
    maxActiveVehicles: record.maxActiveVehicles,
    maxUsers: record.maxUsers,
    customPricing: record.customPricing,
    trialDays: record.trialDays,
    badge: record.badge ?? null,
    ctaLabel: record.ctaLabel,
    features: (record.features as string[]) ?? [],
    isActive: record.isActive,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

@Injectable()
export class MikroSubscriptionPlanRepository
  implements SubscriptionPlanRepository
{
  constructor(
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  async save(plan: StoredSubscriptionPlan): Promise<void> {
    const orm = await getAuthOrm(this.config.db);
    const em = orm.em.fork();
    await em.upsert(SystemSubscriptionPlanRecord, {
      id: plan.id,
      code: plan.code,
      tier: plan.tier,
      name: plan.name,
      description: plan.description,
      monthlyPriceNgn: plan.monthlyPriceNgn,
      yearlyMonthlyEquivalentNgn: plan.yearlyMonthlyEquivalentNgn,
      yearlyDiscountPercent: plan.yearlyDiscountPercent,
      maxActiveVehicles: plan.maxActiveVehicles,
      maxUsers: plan.maxUsers,
      customPricing: plan.customPricing,
      trialDays: plan.trialDays,
      badge: plan.badge,
      ctaLabel: plan.ctaLabel,
      features: plan.features,
      isActive: plan.isActive,
      createdAt: plan.createdAt,
      updatedAt: plan.updatedAt,
    });
  }

  async findById(id: string): Promise<StoredSubscriptionPlan | null> {
    const orm = await getAuthOrm(this.config.db);
    const em = orm.em.fork();
    const record = await em.findOne(SystemSubscriptionPlanRecord, { id });
    return record ? toStored(record) : null;
  }

  async findByCode(code: string): Promise<StoredSubscriptionPlan | null> {
    const orm = await getAuthOrm(this.config.db);
    const em = orm.em.fork();
    const record = await em.findOne(SystemSubscriptionPlanRecord, {
      code: code.trim(),
    });
    return record ? toStored(record) : null;
  }

  async findByTier(
    tier: SubscriptionPlanTier,
  ): Promise<StoredSubscriptionPlan | null> {
    const orm = await getAuthOrm(this.config.db);
    const em = orm.em.fork();
    const record = await em.findOne(
      SystemSubscriptionPlanRecord,
      { tier, isActive: true },
      { orderBy: { createdAt: 'asc' } },
    );
    return record ? toStored(record) : null;
  }

  async findAll(): Promise<StoredSubscriptionPlan[]> {
    const orm = await getAuthOrm(this.config.db);
    const em = orm.em.fork();
    const records = await em.find(
      SystemSubscriptionPlanRecord,
      {},
      { orderBy: { tier: 'asc', name: 'asc' } },
    );
    return records.map((record) => toStored(record));
  }

  async count(): Promise<number> {
    const orm = await getAuthOrm(this.config.db);
    const em = orm.em.fork();
    return em.count(SystemSubscriptionPlanRecord, {});
  }
}
