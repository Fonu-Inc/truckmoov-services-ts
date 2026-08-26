import { Inject, Injectable } from '@nestjs/common';
import {
  SYSTEM_SETTINGS_REPOSITORY,
  buildDefaultSystemSettings,
  normalizeSystemSettings,
  type SystemSettingsRepository,
} from './system-settings.repository';

/**
 * Answers what currency the platform is in, and refuses to convert.
 *
 * This used to fetch a live USD rate and, when that failed, return a hardcoded
 * 1600 with `status: true` — a figure nobody set, cached per process so two
 * replicas could quote different prices for the same plan. A made-up rate
 * presented as a real one misprices the product to anyone reading it.
 *
 * While international currency is off there is no rate to give, and saying so
 * is the honest answer. The requirements are explicit that a rate must never be
 * applied to a stored amount even once it exists: historical figures would
 * drift every time the rate moved.
 */
@Injectable()
export class GetExchangeRateUseCase {
  constructor(
    @Inject(SYSTEM_SETTINGS_REPOSITORY)
    private readonly systemSettingsRepository: SystemSettingsRepository,
  ) {}

  async execute() {
    const stored = await this.systemSettingsRepository.get();
    const settings = normalizeSystemSettings(stored ?? buildDefaultSystemSettings());

    return {
      status: true,
      message: 'success',
      data: {
        currency: settings.defaults.platformCurrency,
        internationalCurrency: settings.features.internationalCurrency,
        // Null, never a number, while conversion is off. A caller that treats a
        // missing rate as 1 is wrong in a way it can see; one handed an invented
        // rate is wrong in a way it cannot.
        ngnPerUsd: null,
      },
    };
  }
}
