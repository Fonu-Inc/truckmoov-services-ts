import { Injectable } from '@nestjs/common';
import {
  buildDefaultSystemSettings,
  type SystemSettings,
  type SystemSettingsRepository,
} from './system-settings.repository';

@Injectable()
export class InMemorySystemSettingsRepository
  implements SystemSettingsRepository
{
  private settings: SystemSettings | null = buildDefaultSystemSettings();

  async get(): Promise<SystemSettings | null> {
    return this.settings ? { ...this.settings } : null;
  }

  async save(settings: SystemSettings): Promise<void> {
    this.settings = { ...settings };
  }
}
