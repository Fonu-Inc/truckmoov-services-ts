import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
} from '@nestjs/common';
import {
  M2M_LICENSE_PLAN_REPOSITORY,
  type M2mLicensePlanRepository,
} from '@auth/onboarding/domain/m2m-license-plan.repository';

type M2mLicensePlanSeed = {
  code: string;
  name: string;
  description: string;
  perDeviceYear1Ngn: number;
  perDeviceRenewalNgn: number;
  sortOrder: number;
};

const DEFAULT_VALIDITY_DAYS = 365;

export const M2M_LICENSE_PLAN_SEEDS: readonly M2mLicensePlanSeed[] = [
  {
    code: 'm2m_standard',
    name: 'M2M Standard License',
    description: 'Suitable for standard fleet management requirements.',
    perDeviceYear1Ngn: 77_000,
    perDeviceRenewalNgn: 75_000,
    sortOrder: 1,
  },
  {
    code: 'm2m_advance',
    name: 'M2M Advance License',
    description:
      'Designed for customers with more advanced fleet management requirements.',
    perDeviceYear1Ngn: 124_000,
    perDeviceRenewalNgn: 80_000,
    sortOrder: 2,
  },
];

@Injectable()
export class M2mLicensePlansBootstrapService implements OnApplicationBootstrap {
  private readonly logger = new Logger(M2mLicensePlansBootstrapService.name);

  constructor(
    @Inject(M2M_LICENSE_PLAN_REPOSITORY)
    private readonly plans: M2mLicensePlanRepository,
  ) {}

  /**
   * Seeds the catalogue once and then leaves it alone.
   *
   * Prices are edited from the platform admin screens, so a boot must never
   * write over a price somebody changed. The code is the stable identity, which
   * makes re-runs and concurrent boots converge on one row per plan.
   */
  async onApplicationBootstrap(): Promise<void> {
    const now = new Date();

    for (const seed of M2M_LICENSE_PLAN_SEEDS) {
      const inserted = await this.plans.insertIfMissing({
        id: `m2m-license-plan-${seed.code}`,
        ...seed,
        validityDays: DEFAULT_VALIDITY_DAYS,
        components: null,
        lastPriceChangedAt: null,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      });
      if (inserted) this.logger.log(`Seeded M2M licence plan ${seed.code}`);
    }
  }
}
