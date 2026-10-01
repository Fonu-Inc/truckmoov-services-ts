import { Inject, Injectable } from '@nestjs/common';
import {
  ENFORCEMENT_SETTINGS_REPOSITORY,
  type EnforcementSettingsRepository,
} from '../../../../../enforcement-settings.repository';
import type { BillingActor } from '@auth/onboarding/domain/ports/billing-audit.port';
import { assertStaff } from './enforcement-access';
import { settingsView } from './enforcement-views';
import { success } from './billing-views';

@Injectable()
export class GetEnforcementSettingsUseCase {
  constructor(
    @Inject(ENFORCEMENT_SETTINGS_REPOSITORY) private readonly settings: EnforcementSettingsRepository,
  ) {}

  async execute(actor: BillingActor) {
    assertStaff(actor, 'Only system admins can view these settings.');
    return success(settingsView(await this.settings.get()));
  }
}
