import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type {
  IdentityClaimInput,
  IdentityClaimRepository,
  StoredIdentityClaim,
} from '@auth/onboarding/domain/identity-claim.repository';

@Injectable()
export class InMemoryIdentityClaimRepository implements IdentityClaimRepository {
  private readonly claims = new Map<string, StoredIdentityClaim>();

  async replaceForApplication(
    applicationId: string,
    claims: IdentityClaimInput[],
  ): Promise<void> {
    await this.deleteForApplication(applicationId);
    for (const claim of claims) {
      const id = randomUUID();
      this.claims.set(id, {
        id,
        applicationId,
        claimType: claim.claimType,
        claimValue: claim.claimValue,
        createdAt: new Date(),
      });
    }
  }

  async findConflicts(
    claims: IdentityClaimInput[],
    excludingApplicationId: string,
  ): Promise<StoredIdentityClaim[]> {
    const wanted = new Set(
      claims.map((claim) => `${claim.claimType}:${claim.claimValue}`),
    );
    return [...this.claims.values()].filter(
      (claim) =>
        claim.applicationId !== excludingApplicationId &&
        wanted.has(`${claim.claimType}:${claim.claimValue}`),
    );
  }

  async deleteForApplication(applicationId: string): Promise<void> {
    for (const [id, claim] of this.claims) {
      if (claim.applicationId === applicationId) this.claims.delete(id);
    }
  }
}
