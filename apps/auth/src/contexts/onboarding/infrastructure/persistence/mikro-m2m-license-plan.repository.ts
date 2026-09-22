import { Inject, Injectable } from '@nestjs/common';
import { AppConfigService } from '@shared/config';
import { getAuthOrm } from '@auth/session/infrastructure/persistence/auth-orm';
import type {
  M2mLicensePlanRepository,
  StoredM2mLicensePlan,
} from '@auth/onboarding/domain/m2m-license-plan.repository';
import { M2mLicensePlanRecord } from './onboarding-orm';

function toStored(r: M2mLicensePlanRecord): StoredM2mLicensePlan {
  return {
    id: r.id,
    code: r.code,
    name: r.name,
    description: r.description,
    perDeviceYear1Ngn: r.perDeviceYear1Ngn,
    perDeviceRenewalNgn: r.perDeviceRenewalNgn,
    sortOrder: r.sortOrder,
    isActive: r.isActive,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

@Injectable()
export class MikroM2mLicensePlanRepository implements M2mLicensePlanRepository {
  constructor(
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  private async em() {
    const orm = await getAuthOrm(this.config.db);
    return orm.em.fork();
  }

  async save(plan: StoredM2mLicensePlan): Promise<void> {
    const em = await this.em();
    const existing = await em.findOne(M2mLicensePlanRecord, { id: plan.id });
    const target = existing ?? new M2mLicensePlanRecord();
    Object.assign(target, plan);
    if (!existing) em.persist(target);
    await em.flush();
  }

  async findByCode(code: string): Promise<StoredM2mLicensePlan | null> {
    const em = await this.em();
    const record = await em.findOne(M2mLicensePlanRecord, { code });
    return record ? toStored(record) : null;
  }

  async findActive(): Promise<StoredM2mLicensePlan[]> {
    const em = await this.em();
    const records = await em.find(
      M2mLicensePlanRecord,
      { isActive: true },
      { orderBy: { sortOrder: 'asc' } },
    );
    return records.map(toStored);
  }
}
