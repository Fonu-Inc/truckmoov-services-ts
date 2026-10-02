import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  TOKEN_SERVICE,
  USER_REPOSITORY,
  ForbiddenError,
} from './contexts/auth/session';
import { resolveActorUser } from './contexts/auth/session/application/use-cases/support/resolve-actor-user';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import { DuplicateSimIccidError, SIM_REPOSITORY, type SimRepository, type StoredSim } from './sim.repository';
import { EntitlementService, QuotaExceededError } from './entitlement.service';
import {
  TENANT_ONBOARDING_REPOSITORY,
  type TenantOnboardingRepository,
} from './tenant-onboarding.repository';

export type SimRegistrationInput = {
  iccid: string;
  mobileNumber: string;
  networkOperator: string;
};

@Injectable()
export class RegisterSimsUseCase {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(SIM_REPOSITORY) private readonly simRepository: SimRepository,
    @Inject(EntitlementService) private readonly entitlements: EntitlementService,
    @Inject(TENANT_ONBOARDING_REPOSITORY)
    private readonly onboarding: TenantOnboardingRepository,
  ) {}

  async execute(accessToken: string, sims: SimRegistrationInput[]) {
    const actor = await resolveActorUser(
      accessToken,
      this.tokenService,
      this.userRepository,
    );
    if (actor.tenantId === 'system') {
      throw new ForbiddenError('System actors cannot register SIMs');
    }

    // Checked for the whole batch before any SIM is written, so a registration
    // that would cross the plan limit is refused rather than half applied.
    await this.assertQuotaAllowsMoreSims(actor.tenantId, await this.countNewSims(sims));

    const now = new Date();
    const created: Array<{ id: string; iccid: string }> = [];
    const skipped: Array<{ iccid: string; reason: string }> = [];

    for (const input of sims) {
      const sim = this.newSim(input, actor.tenantId, now);
      try {
        await this.simRepository.save(sim);
        created.push({ id: sim.id, iccid: sim.iccid });
      } catch (error) {
        if (!(error instanceof DuplicateSimIccidError)) throw error;
        skipped.push({ iccid: input.iccid, reason: 'A SIM with this ICCID is already registered' });
      }
    }

    return {
      status: true,
      message: 'success',
      data: { registered: created.length, created, skipped },
    };
  }

  private newSim(input: SimRegistrationInput, tenantId: string, now: Date): StoredSim {
    return {
      id: randomUUID(),
      iccid: input.iccid,
      imsi: null,
      msisdn: input.mobileNumber,
      carrier: input.networkOperator,
      plan: 'iot_basic',
      status: 'registered',
      tenantId,
      deviceId: null,
      deviceName: null,
      deviceImei: null,
      deviceType: null,
      vehicleId: null,
      suspensionReason: null,
      notes: null,
      dataUsageMb: 0,
      dataLimitMb: 0,
      smsUsage: 0,
      smsLimit: 0,
      monthlyCostNgn: 0,
      activationDate: null,
      expiryDate: null,
      lastActivity: null,
      signalStrength: null,
      networkType: null,
      roaming: false,
      fonuSimId: null,
      fonuStatus: null,
      createdAt: now,
      updatedAt: now,
    };
  }

  /**
   * Counts the SIMs a tenant holds, excluding decommissioned ones: a retired
   * SIM does not occupy a seat on the plan, the same way a decommissioned
   * vehicle does not.
   *
   * A tenant with no plan, no override or no configured entitlements is not limited, rather
   * than being refused: an absent quota is not a quota of zero.
   */
  private async countNewSims(sims: SimRegistrationInput[]): Promise<number> {
    const iccids = [...new Set(sims.map((sim) => sim.iccid))];
    const existing = new Set((await this.simRepository.findByIccids(iccids)).map((sim) => sim.iccid));
    return iccids.filter((iccid) => !existing.has(iccid)).length;
  }

  private async assertQuotaAllowsMoreSims(tenantId: string, adding: number): Promise<void> {
    if (adding === 0) return;
    const onboarding = await this.onboarding.findByTenantId(tenantId);
    const planCode = onboarding?.subscription?.planCode ?? null;

    const { items } = await this.simRepository.findAll({ tenantId, limit: 100_000 });
    const inUse = items.filter((sim) => sim.status !== 'decommissioned').length;

    try {
      await this.entitlements.assertTenantQuota(tenantId, planCode, 'sims', inUse + adding - 1);
    } catch (error) {
      if (error instanceof QuotaExceededError) throw error;
      // No entitlements configured for the plan. Not a reason to refuse.
    }
  }
}
