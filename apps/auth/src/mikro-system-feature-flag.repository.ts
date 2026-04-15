import { Inject, Injectable } from '@nestjs/common';
import { AppConfigService } from '@shared/config';
import {
  SystemFeatureFlagRecord,
  getAuthOrm,
} from './contexts/auth/session/infrastructure/persistence/auth-orm';
import {
  buildDefaultSystemFeatureFlags,
  type SystemFeatureFlag,
  type SystemFeatureFlagRepository,
} from './system-feature-flag.repository';

@Injectable()
export class MikroSystemFeatureFlagRepository
  implements SystemFeatureFlagRepository
{
  constructor(
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  async list(): Promise<SystemFeatureFlag[]> {
    await this.ensureSeeded();

    const orm = await getAuthOrm(this.config.db);
    const em = orm.em.fork();
    const records = await em.find(
      SystemFeatureFlagRecord,
      {},
      { orderBy: { featureName: 'asc' } },
    );

    return records as SystemFeatureFlag[];
  }

  async findByFeatureKey(featureKey: string): Promise<SystemFeatureFlag | null> {
    await this.ensureSeeded();

    const orm = await getAuthOrm(this.config.db);
    const em = orm.em.fork();
    const record = await em.findOne(SystemFeatureFlagRecord, { featureKey });
    return record as SystemFeatureFlag | null;
  }

  async save(flag: SystemFeatureFlag): Promise<void> {
    const orm = await getAuthOrm(this.config.db);
    const em = orm.em.fork();
    await em.upsert(SystemFeatureFlagRecord, flag);
  }

  private async ensureSeeded(): Promise<void> {
    const orm = await getAuthOrm(this.config.db);
    const em = orm.em.fork();
    const count = await em.count(SystemFeatureFlagRecord, {});
    if (count > 0) {
      return;
    }

    for (const flag of buildDefaultSystemFeatureFlags()) {
      await em.upsert(SystemFeatureFlagRecord, flag);
    }
  }
}
