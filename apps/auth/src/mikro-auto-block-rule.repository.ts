import { Inject, Injectable } from '@nestjs/common';
import { AppConfigService } from '@shared/config';
import { AutoBlockRuleRecord, getAuthOrm } from './contexts/auth/session/infrastructure/persistence/auth-orm';
import type { AutoBlockRuleId, AutoBlockRuleRepository, StoredAutoBlockRule } from './auto-block-rule.repository';

function toStored(r: AutoBlockRuleRecord): StoredAutoBlockRule {
  return {
    id: r.id as AutoBlockRuleId,
    name: r.name,
    enabled: r.enabled,
    maxAttempts: r.maxAttempts,
    windowMinutes: r.windowMinutes,
    blockDurationHours: r.blockDurationHours,
    precedence: r.precedence,
    updatedAt: r.updatedAt,
    updatedBy: r.updatedBy,
  };
}

@Injectable()
export class MikroAutoBlockRuleRepository implements AutoBlockRuleRepository {
  constructor(@Inject(AppConfigService) private readonly config: AppConfigService) {}

  async findAll(): Promise<StoredAutoBlockRule[]> {
    const orm = await getAuthOrm(this.config.db);
    const em = orm.em.fork();
    const records = await em.find(AutoBlockRuleRecord, {}, { orderBy: { precedence: 'asc' } });
    return records.map(toStored);
  }

  async findEnabledInOrder(): Promise<StoredAutoBlockRule[]> {
    const orm = await getAuthOrm(this.config.db);
    const em = orm.em.fork();
    const records = await em.find(AutoBlockRuleRecord, { enabled: true }, { orderBy: { precedence: 'asc' } });
    return records.map(toStored);
  }

  async findById(id: AutoBlockRuleId): Promise<StoredAutoBlockRule | null> {
    const orm = await getAuthOrm(this.config.db);
    const em = orm.em.fork();
    const record = await em.findOne(AutoBlockRuleRecord, { id });
    return record ? toStored(record) : null;
  }

  async save(rule: StoredAutoBlockRule): Promise<void> {
    const orm = await getAuthOrm(this.config.db);
    const em = orm.em.fork();
    await em.upsert(AutoBlockRuleRecord, rule as unknown as AutoBlockRuleRecord);
  }
}
