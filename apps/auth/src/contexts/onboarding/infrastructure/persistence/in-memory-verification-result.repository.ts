import { Injectable } from '@nestjs/common';
import type {
  StoredVerificationResult,
  VerificationResultRepository,
} from '@auth/onboarding/domain/verification-result.repository';

@Injectable()
export class InMemoryVerificationResultRepository
  implements VerificationResultRepository
{
  private readonly results = new Map<string, StoredVerificationResult[]>();

  async replaceForApplication(
    applicationId: string,
    results: StoredVerificationResult[],
  ): Promise<void> {
    this.results.set(
      applicationId,
      results.map((result) => ({ ...result })),
    );
  }

  async findByApplicationId(
    applicationId: string,
  ): Promise<StoredVerificationResult[]> {
    return this.results.get(applicationId) ?? [];
  }

  async deleteForApplication(applicationId: string): Promise<void> {
    this.results.delete(applicationId);
  }
}
