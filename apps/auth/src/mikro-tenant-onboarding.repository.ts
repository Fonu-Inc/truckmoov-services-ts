import { Inject, Injectable } from "@nestjs/common";
import { AppConfigService } from "@shared/config";
import {
  getAuthOrm,
  SystemTenantOnboardingRecord,
} from "./contexts/auth/session/infrastructure/persistence/auth-orm";
import {
  type StoredTenantOnboarding,
  type TenantOnboardingRepository,
} from "./tenant-onboarding.repository";

function toStored(record: SystemTenantOnboardingRecord): StoredTenantOnboarding {
  return {
    ...record,
    organizationType: record.organizationType as StoredTenantOnboarding["organizationType"],
    bootstrapRole: record.bootstrapRole,
    company: record.company as StoredTenantOnboarding["company"],
    subscription: record.subscription as StoredTenantOnboarding["subscription"],
    deviceProvisioning: record.deviceProvisioning as StoredTenantOnboarding["deviceProvisioning"],
    simAssignment: record.simAssignment as StoredTenantOnboarding["simAssignment"],
    features: record.features as StoredTenantOnboarding["features"],
    status: record.status as StoredTenantOnboarding["status"],
  };
}

@Injectable()
export class MikroTenantOnboardingRepository implements TenantOnboardingRepository {
  constructor(@Inject(AppConfigService) private readonly config: AppConfigService) {}

  async save(onboarding: StoredTenantOnboarding): Promise<void> {
    const orm = await getAuthOrm(this.config.db);
    const em = orm.em.fork();
    await em.upsert(SystemTenantOnboardingRecord, {
      ...onboarding,
      updatedAt: onboarding.updatedAt,
    });
  }

  async findByTenantId(tenantId: string): Promise<StoredTenantOnboarding | null> {
    const orm = await getAuthOrm(this.config.db);
    const em = orm.em.fork();
    const record = await em.findOne(SystemTenantOnboardingRecord, { tenantId });
    return record ? toStored(record) : null;
  }

  async findAll(): Promise<StoredTenantOnboarding[]> {
    const orm = await getAuthOrm(this.config.db);
    const em = orm.em.fork();
    const records = await em.find(SystemTenantOnboardingRecord, {}, {
      orderBy: { createdAt: "desc" },
    });
    return records.map((record) => toStored(record));
  }
}
