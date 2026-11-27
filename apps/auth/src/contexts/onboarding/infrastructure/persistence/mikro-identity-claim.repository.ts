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
    if (claims.length === 0) {
      await this.deleteForApplication(applicationId);
      return;
    }

    // One statement: the delete and the insert commit together without a transaction round trip.
    const em = await this.em();
    const now = new Date();
    await em.getConnection().execute(
      `with removed as (delete from onboarding_identity_claims where application_id = ?)
       insert into onboarding_identity_claims (id, application_id, claim_type, claim_value, created_at)
       values ${claims.map(() => '(?, ?, ?, ?, ?)').join(', ')}`,
      [
        applicationId,
        ...claims.flatMap((claim) => [
          randomUUID(),
          applicationId,
          claim.claimType,
          claim.claimValue,
          now,
        ]),
      ],
    );
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
