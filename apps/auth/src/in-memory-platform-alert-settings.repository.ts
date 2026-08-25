import { Injectable } from '@nestjs/common';
import {
  PLATFORM_ALERT_TYPES,
  type PlatformAlertSetting,
  type PlatformAlertSettingsRepository,
  type PlatformAlertType,
} from './platform-alert-settings.repository';

@Injectable()
export class InMemoryPlatformAlertSettingsRepository
  implements PlatformAlertSettingsRepository
{
  private readonly byType = new Map<PlatformAlertType, PlatformAlertSetting>(
    PLATFORM_ALERT_TYPES.map((alertType) => [
      alertType,
      {
        alertType,
        enabled: true,
        channels: ['email'],
        recipients: [],
        minSeverity: alertType === 'new_tenant_signup' ? 'low' : 'high',
        updatedAt: new Date(0).toISOString(),
        updatedBy: null,
      },
    ]),
  );

  async findAll(): Promise<PlatformAlertSetting[]> {
    return PLATFORM_ALERT_TYPES.map((alertType) => ({ ...this.byType.get(alertType)! }));
  }

  async findByType(alertType: PlatformAlertType): Promise<PlatformAlertSetting | null> {
    const setting = this.byType.get(alertType);
    return setting ? { ...setting } : null;
  }

  async save(setting: PlatformAlertSetting): Promise<void> {
    this.byType.set(setting.alertType, { ...setting });
  }
}
