import { Inject, Injectable } from '@nestjs/common';
import { LockMode, type EntityManager } from '@mikro-orm/core';
import { AppConfigService } from '@shared/config';
import { getAuthOrm } from '@auth/session/infrastructure/persistence/auth-orm';
import type { StoredBillingPriceChange } from '@auth/onboarding/domain/billing-price-change.repository';
import type {
  M2mLicensePlanFilter,
  M2mLicensePlanRepository,
  PricedPlanEdit,
  PricedPlanEditResult,
  StoredM2mLicensePlan,
} from '@auth/onboarding/domain/m2m-license-plan.repository';
import { M2mLicensePlanRecord } from './onboarding-orm';
import { toPlan, toPriceChangeRecord } from './mikro-billing-mappers';

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

@Injectable()
export class MikroM2mLicensePlanRepository implements M2mLicensePlanRepository {
  constructor(
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  private async orm() {
    return getAuthOrm(this.config.db);
  }

  private async em() {
    return (await this.orm()).em.fork();
  }

  async save(plan: StoredM2mLicensePlan): Promise<void> {
    const em = await this.em();
    await this.upsert(em, plan);
    await em.flush();
  }

  async savePriced(
    plan: StoredM2mLicensePlan,
    changes: StoredBillingPriceChange[],
  ): Promise<void> {
    const em = await this.em();
    await em.transactional(async (tx) => {
      await this.upsert(tx, plan);
      for (const change of changes) tx.persist(toPriceChangeRecord(change));
    });
  }

  async editPriced(
    code: string,
    build: (current: StoredM2mLicensePlan) => PricedPlanEdit | null,
  ): Promise<PricedPlanEditResult | null> {
    const em = await this.em();
    return em.transactional(async (tx) => {
      const record = await tx.findOne(
        M2mLicensePlanRecord,
        { code },
        { lockMode: LockMode.PESSIMISTIC_WRITE },
      );
      if (!record) return null;
      const before = toPlan(record);
      const edit = build(before);
      if (!edit) return { before, after: before };
      Object.assign(record, edit.plan);
      for (const change of edit.changes) tx.persist(toPriceChangeRecord(change));
      return { before, after: edit.plan };
    });
  }

  private async upsert(em: EntityManager, plan: StoredM2mLicensePlan) {
    const existing = await em.findOne(M2mLicensePlanRecord, { id: plan.id });
    const target = existing ?? new M2mLicensePlanRecord();
    Object.assign(target, plan);
    if (!existing) em.persist(target);
  }

  async insertIfMissing(plan: StoredM2mLicensePlan): Promise<boolean> {
    const em = await this.em();
    const rows = await em.getConnection().execute<Array<{ id: string }>>(
      `insert into "m2m_license_plans"
         ("id", "code", "name", "description", "per_device_year1_ngn",
          "per_device_renewal_ngn", "validity_days", "components",
          "last_price_changed_at", "sort_order", "is_active", "created_at", "updated_at")
       values (?, ?, ?, ?, ?, ?, ?, ?::jsonb, ?, ?, ?, ?, ?)
       on conflict ("code") do nothing
       returning "id"`,
      [
        plan.id,
        plan.code,
        plan.name,
        plan.description,
        plan.perDeviceYear1Ngn,
        plan.perDeviceRenewalNgn,
        plan.validityDays,
        plan.components === null ? null : JSON.stringify(plan.components),
        plan.lastPriceChangedAt,
        plan.sortOrder,
        plan.isActive,
        plan.createdAt,
        plan.updatedAt,
      ],
    );
    return rows.length > 0;
  }

  async findByCode(code: string): Promise<StoredM2mLicensePlan | null> {
    const em = await this.em();
    const record = await em.findOne(M2mLicensePlanRecord, { code });
    return record ? toPlan(record) : null;
  }

  async findActive(): Promise<StoredM2mLicensePlan[]> {
    const em = await this.em();
    const records = await em.find(
      M2mLicensePlanRecord,
      { isActive: true },
      { orderBy: { sortOrder: 'asc' } },
    );
    return records.map(toPlan);
  }

  async list(filter: M2mLicensePlanFilter) {
    const em = await this.em();
    const term = filter.q?.trim();
    const where = {
      ...(filter.status === 'active' && { isActive: true }),
      ...(filter.status === 'inactive' && { isActive: false }),
      ...(term && {
        $or: [
          { name: { $ilike: `%${escapeLike(term)}%` } },
          { code: { $ilike: `%${escapeLike(term)}%` } },
        ],
      }),
    };
    const [records, total] = await em.findAndCount(M2mLicensePlanRecord, where, {
      orderBy: { sortOrder: 'asc', code: 'asc' },
      limit: filter.limit,
      offset: (filter.page - 1) * filter.limit,
    });
    return { items: records.map(toPlan), total };
  }

  async nextSortOrder(): Promise<number> {
    const em = await this.em();
    const [last] = await em.find(
      M2mLicensePlanRecord,
      {},
      { orderBy: { sortOrder: 'desc' }, limit: 1 },
    );
    return last ? Number(last.sortOrder) + 1 : 1;
  }
}
