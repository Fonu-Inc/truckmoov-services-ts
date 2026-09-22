import { Inject, Injectable } from '@nestjs/common';
import { AppConfigService } from '@shared/config';
import { getAuthOrm } from '@auth/session/infrastructure/persistence/auth-orm';
import type {
  StoredVerificationResult,
  VerificationResultRepository,
} from '@auth/onboarding/domain/verification-result.repository';
import { OnboardingVerificationResultRecord } from './onboarding-orm';

function toStored(
  r: OnboardingVerificationResultRecord,
): StoredVerificationResult {
  return {
    id: r.id,
    applicationId: r.applicationId,
    check: r.check as StoredVerificationResult['check'],
    verdict: r.verdict as StoredVerificationResult['verdict'],
    reference: r.reference,
    summary: r.summary,
    fields: (r.fields ?? []) as StoredVerificationResult['fields'],
    provider: r.provider,
    checkedAt: r.checkedAt,
  };
}

@Injectable()
export class MikroVerificationResultRepository
  implements VerificationResultRepository
{
  constructor(
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  private async em() {
    const orm = await getAuthOrm(this.config.db);
    return orm.em.fork();
  }

  async replaceForApplication(
    applicationId: string,
    results: StoredVerificationResult[],
  ): Promise<void> {
    const em = await this.em();
    await em.nativeDelete(OnboardingVerificationResultRecord, {
      applicationId,
    });

    for (const result of results) {
      const record = new OnboardingVerificationResultRecord();
      Object.assign(record, result);
      em.persist(record);
    }
    await em.flush();
  }

  async findByApplicationId(
    applicationId: string,
  ): Promise<StoredVerificationResult[]> {
    const em = await this.em();
    const records = await em.find(
      OnboardingVerificationResultRecord,
      { applicationId },
      { orderBy: { checkedAt: 'asc' } },
    );
    return records.map(toStored);
  }

  async deleteForApplication(applicationId: string): Promise<void> {
    const em = await this.em();
    await em.nativeDelete(OnboardingVerificationResultRecord, {
      applicationId,
    });
  }
}
