import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { AppConfigService } from '@shared/config';
import { getAuthOrm } from '@auth/session/infrastructure/persistence/auth-orm';
import type {
  IdentityClaimInput,
  IdentityClaimRepository,
  StoredIdentityClaim,
} from '@auth/onboarding/domain/identity-claim.repository';
import { OnboardingIdentityClaimRecord } from './onboarding-orm';

function toStored(r: OnboardingIdentityClaimRecord): StoredIdentityClaim {
  return {
    id: r.id,
    applicationId: r.applicationId,
    claimType: r.claimType as StoredIdentityClaim['claimType'],
    claimValue: r.claimValue,
    createdAt: r.createdAt,
  };
}

@Injectable()
export class MikroIdentityClaimRepository implements IdentityClaimRepository {
  constructor(
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  private async em() {
    const orm = await getAuthOrm(this.config.db);
    return orm.em.fork();
  }

  async replaceForApplication(
    applicationId: string,
    claims: IdentityClaimInput[],
  ): Promise<void> {
    const em = await this.em();
    await em.nativeDelete(OnboardingIdentityClaimRecord, { applicationId });

    for (const claim of claims) {
      const record = new OnboardingIdentityClaimRecord();
      Object.assign(record, {
        id: randomUUID(),
        applicationId,
        claimType: claim.claimType,
        claimValue: claim.claimValue,
        createdAt: new Date(),
      });
      em.persist(record);
    }
    await em.flush();
  }

  async findConflicts(
    claims: IdentityClaimInput[],
    excludingApplicationId: string,
  ): Promise<StoredIdentityClaim[]> {
    if (claims.length === 0) return [];
    const em = await this.em();
    const records = await em.find(OnboardingIdentityClaimRecord, {
      applicationId: { $ne: excludingApplicationId },
      $or: claims.map((claim) => ({
        claimType: claim.claimType,
        claimValue: claim.claimValue,
      })),
    });
    return records.map(toStored);
  }

  async deleteForApplication(applicationId: string): Promise<void> {
    const em = await this.em();
    await em.nativeDelete(OnboardingIdentityClaimRecord, { applicationId });
  }
}
