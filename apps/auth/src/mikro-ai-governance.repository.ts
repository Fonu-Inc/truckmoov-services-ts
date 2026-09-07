import { Inject, Injectable } from '@nestjs/common';
import { AppConfigService } from '@shared/config';
import {
  AiGovernanceRecord,
  getAuthOrm,
} from './contexts/auth/session/infrastructure/persistence/auth-orm';
import {
  AI_GOVERNANCE_ID,
  normalizeAiGovernance,
  type AiGovernanceRepository,
  type AiGovernanceSettings,
} from './ai-governance.repository';

@Injectable()
export class MikroAiGovernanceRepository implements AiGovernanceRepository {
  constructor(@Inject(AppConfigService) private readonly config: AppConfigService) {}

  async get(): Promise<AiGovernanceSettings | null> {
    const em = await this.em();
    const record = await em.findOne(AiGovernanceRecord, { id: AI_GOVERNANCE_ID });
    if (!record) return null;

    return normalizeAiGovernance({
      matchingEnabled: record.matchingEnabled,
      providers: (record.providers ?? []) as AiGovernanceSettings['providers'],
      rateLimits: (record.rateLimits ?? {}) as AiGovernanceSettings['rateLimits'],
      dataProtection: (record.dataProtection ?? {}) as AiGovernanceSettings['dataProtection'],
      updatedByUserId: record.updatedByUserId,
      updatedAt: record.updatedAt,
    });
  }

  async save(settings: AiGovernanceSettings): Promise<void> {
    const em = await this.em();
    await em.upsert(AiGovernanceRecord, {
      id: AI_GOVERNANCE_ID,
      matchingEnabled: settings.matchingEnabled,
      providers: settings.providers,
      rateLimits: settings.rateLimits,
      dataProtection: settings.dataProtection,
      updatedByUserId: settings.updatedByUserId,
      updatedAt: settings.updatedAt,
    });
  }

  private async em() {
    const orm = await getAuthOrm(this.config.db);
    return orm.em.fork();
  }
}

@Injectable()
export class InMemoryAiGovernanceRepository implements AiGovernanceRepository {
  private settings: AiGovernanceSettings | null = null;

  async get(): Promise<AiGovernanceSettings | null> {
    return this.settings;
  }

  async save(settings: AiGovernanceSettings): Promise<void> {
    this.settings = settings;
  }
}
