import { Inject, Injectable } from '@nestjs/common';
import { AppConfigService } from '@shared/config';
import {
  PlatformAlertSettingRecord,
  getAuthOrm,
} from './contexts/auth/session/infrastructure/persistence/auth-orm';
import type {
  AlertChannel,
  AlertSeverity,
  PlatformAlertSetting,
  PlatformAlertSettingsRepository,
  PlatformAlertType,
} from './platform-alert-settings.repository';

function toSetting(record: PlatformAlertSettingRecord): PlatformAlertSetting {
  return {
    alertType: record.alertType as PlatformAlertType,
    enabled: record.enabled,
    channels: (record.channels ?? []) as AlertChannel[],
    recipients: (record.recipients ?? []) as string[],
    minSeverity: record.minSeverity as AlertSeverity,
    updatedAt: record.updatedAt.toISOString(),
    updatedBy: record.updatedBy,
  };
}

@Injectable()
export class MikroPlatformAlertSettingsRepository implements PlatformAlertSettingsRepository {
  constructor(@Inject(AppConfigService) private readonly config: AppConfigService) {}

  async findAll(): Promise<PlatformAlertSetting[]> {
    const orm = await getAuthOrm(this.config.db);
    const rows = await orm.em.fork().find(PlatformAlertSettingRecord, {});
    return rows.map(toSetting);
  }

  async findByType(alertType: PlatformAlertType): Promise<PlatformAlertSetting | null> {
    const orm = await getAuthOrm(this.config.db);
    const row = await orm.em.fork().findOne(PlatformAlertSettingRecord, { alertType });
    return row ? toSetting(row) : null;
  }

  async save(setting: PlatformAlertSetting): Promise<void> {
    const orm = await getAuthOrm(this.config.db);
    await orm.em.fork().upsert(PlatformAlertSettingRecord, {
      alertType: setting.alertType,
      enabled: setting.enabled,
      channels: setting.channels,
      recipients: setting.recipients,
      minSeverity: setting.minSeverity,
      updatedAt: new Date(),
      updatedBy: setting.updatedBy,
    });
  }
}
