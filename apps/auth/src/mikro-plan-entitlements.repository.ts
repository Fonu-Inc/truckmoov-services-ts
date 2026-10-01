import { Inject, Injectable } from '@nestjs/common';
import { AppConfigService } from '@shared/config';
import {
  PlanEntitlementRecord,
  TenantUsageAllowanceRecord,
  getAuthOrm,
} from './contexts/auth/session/infrastructure/persistence/auth-orm';
import type {
  FeatureEntitlement,
  OrganisationType,
  PaymentModel,
  PlanEntitlements,
  UsageAllowance,
  UsageItem,
} from './plan-entitlements';
import type {
  AllowanceUsage,
  PlanEntitlementsRepository,
} from './plan-entitlements.repository';

function toEntitlements(record: PlanEntitlementRecord): PlanEntitlements {
  return {
    planCode: record.planCode,
    paymentModel: record.paymentModel as PaymentModel,
    inheritsFromCode: record.inheritsFromCode,
    quotas: (record.quotas ?? {}) as PlanEntitlements['quotas'],
    limitBehaviour: (record.limitBehaviour ?? {}) as PlanEntitlements['limitBehaviour'],
    features: (record.features ?? []) as FeatureEntitlement[],
    allowances: (record.allowances ?? []) as UsageAllowance[],
    availableFor: (record.availableFor ?? []) as OrganisationType[],
    trialDays: record.trialDays,
  };
}

@Injectable()
export class MikroPlanEntitlementsRepository implements PlanEntitlementsRepository {
  constructor(@Inject(AppConfigService) private readonly config: AppConfigService) {}

  async findByPlanCode(planCode: string): Promise<PlanEntitlements | null> {
    const orm = await getAuthOrm(this.config.db);
    const record = await orm.em.fork().findOne(PlanEntitlementRecord, { planCode });
    return record ? toEntitlements(record) : null;
  }

  async findAll(): Promise<PlanEntitlements[]> {
    const orm = await getAuthOrm(this.config.db);
    const records = await orm.em.fork().find(PlanEntitlementRecord, {});
    return records.map(toEntitlements);
  }

  async save(entitlements: PlanEntitlements, updatedBy: string | null): Promise<void> {
    const orm = await getAuthOrm(this.config.db);
    await orm.em.fork().upsert(PlanEntitlementRecord, {
      planCode: entitlements.planCode,
      paymentModel: entitlements.paymentModel,
      inheritsFromCode: entitlements.inheritsFromCode,
      quotas: entitlements.quotas,
      limitBehaviour: entitlements.limitBehaviour,
      features: entitlements.features,
      allowances: entitlements.allowances,
      availableFor: entitlements.availableFor,
      trialDays: entitlements.trialDays,
      updatedAt: new Date(),
      updatedBy,
    });
  }

  /**
   * Takes what is left of this month's allowance, under a row lock.
   *
   * An allowance has to run out exactly once. Reading the counter and writing
   * it back as two steps would let two concurrent sends both see room and both
   * take it, and the tenant would get more free units than the plan includes.
   * The lock is what makes "what is left" true for the caller that read it.
   */
  async consumeAllowance(
    tenantId: string,
    item: UsageItem,
    billingMonth: string,
    requested: number,
    includedPerMonth: number,
  ): Promise<{ covered: number; uncovered: number }> {
    if (includedPerMonth <= 0 || requested <= 0) {
      return { covered: 0, uncovered: Math.max(0, requested) };
    }

    const orm = await getAuthOrm(this.config.db);

    return orm.em.fork().transactional(async (tx) => {
      const connection = tx.getConnection();

      // Creates the row for a month that has not been touched yet, so the
      // lock below always has something to hold.
      await connection.execute(
        `insert into "tenant_usage_allowance" ("tenant_id", "item", "billing_month", "used")
           values (?, ?, ?, 0)
         on conflict ("tenant_id", "item", "billing_month") do nothing`,
        [tenantId, item, billingMonth],
      );

      const locked = await connection.execute<Array<{ used: string }>>(
        `select "used" from "tenant_usage_allowance"
          where "tenant_id" = ? and "item" = ? and "billing_month" = ?
          for update`,
        [tenantId, item, billingMonth],
      );

      const used = Number(locked[0]?.used ?? 0);
      const remaining = Math.max(0, includedPerMonth - used);
      const covered = Math.min(requested, remaining);

      if (covered > 0) {
        await connection.execute(
          `update "tenant_usage_allowance"
              set "used" = "used" + ?, "updated_at" = now()
            where "tenant_id" = ? and "item" = ? and "billing_month" = ?`,
          [covered, tenantId, item, billingMonth],
        );
      }

      return { covered, uncovered: requested - covered };
    });
  }

  async releaseAllowance(
    tenantId: string,
    item: UsageItem,
    billingMonth: string,
    units: number,
  ): Promise<void> {
    if (units <= 0) return;
    const orm = await getAuthOrm(this.config.db);
    await orm.em.fork().getConnection().execute(
      `update "tenant_usage_allowance"
          set "used" = greatest("used" - ?, 0), "updated_at" = now()
        where "tenant_id" = ? and "item" = ? and "billing_month" = ?`,
      [units, tenantId, item, billingMonth],
    );
  }

  async findUsage(tenantId: string, billingMonth: string): Promise<AllowanceUsage[]> {
    const orm = await getAuthOrm(this.config.db);
    const records = await orm.em
      .fork()
      .find(TenantUsageAllowanceRecord, { tenantId, billingMonth } as never);

    return records.map((record) => ({
      tenantId: record.tenantId,
      item: record.item as UsageItem,
      billingMonth: record.billingMonth,
      used: Number(record.used),
    }));
  }
}
