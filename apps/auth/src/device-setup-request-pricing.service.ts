import { Inject, Injectable } from '@nestjs/common';
import { buildSetupRequestCharges, type DeviceSetupRequestCharges } from '@shared/devices';
import {
  BILLING_SETTINGS_REPOSITORY,
  type BillingSettingsRepository,
} from '@auth/onboarding/domain/billing-settings.repository';
import {
  LICENCE_PERIOD_REPOSITORY,
  RENEWAL_FACTS_READER,
  type LicencePeriodRepository,
  type RenewalFactsReader,
} from '@auth/onboarding/domain/licence-period.repository';
import {
  M2M_LICENSE_PLAN_REPOSITORY,
  type M2mLicensePlanRepository,
} from '@auth/onboarding/domain/m2m-license-plan.repository';
import { installationFeeFor, toKobo } from '@auth/onboarding/domain/onboarding-order';
import { loadInstallationFees } from '@auth/onboarding/application/use-cases/support/installation-fees';

export class DeviceSetupRequestUnpricedError extends Error {
  constructor(reason: string) {
    super(`This device request cannot be priced: ${reason}`);
    this.name = 'DeviceSetupRequestUnpricedError';
  }
}

/**
 * Prices extra devices the way onboarding prices an order: the tenant's
 * licence plan year-1 price plus the installation fee for their customer type,
 * per device. No tax line, matching the stated formula.
 */
@Injectable()
export class DeviceSetupRequestPricingService {
  constructor(
    @Inject(LICENCE_PERIOD_REPOSITORY) private readonly periods: LicencePeriodRepository,
    @Inject(RENEWAL_FACTS_READER) private readonly facts: RenewalFactsReader,
    @Inject(M2M_LICENSE_PLAN_REPOSITORY) private readonly plans: M2mLicensePlanRepository,
    @Inject(BILLING_SETTINGS_REPOSITORY) private readonly settings: BillingSettingsRepository,
  ) {}

  async chargesFor(tenantId: string, quantity: number): Promise<DeviceSetupRequestCharges> {
    const period = await this.periods.findActiveByTenant(tenantId);
    if (!period) throw new DeviceSetupRequestUnpricedError('the tenant has no active licence plan');

    const [plan, facts, fees] = await Promise.all([
      this.plans.findByCode(period.planCode),
      this.facts.facts(tenantId, period.applicationId),
      loadInstallationFees(this.settings),
    ]);
    if (!plan) throw new DeviceSetupRequestUnpricedError(`licence plan ${period.planCode} no longer exists`);
    if (!facts) throw new DeviceSetupRequestUnpricedError('the tenant\'s customer type is unknown');

    const charges = buildSetupRequestCharges({
      planCode: plan.code,
      planName: plan.name,
      quantity,
      licencePerDeviceKobo: toKobo(plan.perDeviceYear1Ngn),
      installationPerDeviceKobo: toKobo(installationFeeFor(facts.customerType, fees)),
    });
    if (!(charges.totalKobo > 0)) throw new DeviceSetupRequestUnpricedError('the prices come to nothing');
    return charges;
  }
}
