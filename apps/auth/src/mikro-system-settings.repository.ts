import { Inject, Injectable } from '@nestjs/common';
import { AppConfigService } from '@shared/config';
import {
  SystemSettingsRecord,
  getAuthOrm,
} from './contexts/auth/session/infrastructure/persistence/auth-orm';
import type {
  SystemSettings,
  SystemSettingsRepository,
} from './system-settings.repository';

@Injectable()
export class MikroSystemSettingsRepository implements SystemSettingsRepository {
  constructor(
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  async get(): Promise<SystemSettings | null> {
    const orm = await getAuthOrm(this.config.db);
    const em = orm.em.fork();
    const record = await em.findOne(SystemSettingsRecord, { id: 'system' });
    return record as SystemSettings | null;
  }

  async save(settings: SystemSettings): Promise<void> {
    const orm = await getAuthOrm(this.config.db);
    const em = orm.em.fork();
    await em.upsert(SystemSettingsRecord, settings);
  }
}
