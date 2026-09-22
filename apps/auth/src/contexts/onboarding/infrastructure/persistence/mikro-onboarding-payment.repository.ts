import { Inject, Injectable } from '@nestjs/common';
import { AppConfigService } from '@shared/config';
import { getAuthOrm } from '@auth/session/infrastructure/persistence/auth-orm';
import type {
  OnboardingPaymentRepository,
  StoredOnboardingPayment,
} from '@auth/onboarding/domain/onboarding-payment.repository';
import { OnboardingPaymentRecord } from './onboarding-orm';

function toStored(r: OnboardingPaymentRecord): StoredOnboardingPayment {
  return {
    id: r.id,
    applicationId: r.applicationId,
    reference: r.reference,
    provider: r.provider,
    amountKobo: r.amountKobo,
    billingEmail: r.billingEmail,
    planCode: r.planCode,
    deviceCount: r.deviceCount,
    status: r.status as StoredOnboardingPayment['status'],
    paidAt: r.paidAt ?? null,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

@Injectable()
export class MikroOnboardingPaymentRepository
  implements OnboardingPaymentRepository
{
  constructor(
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  private async em() {
    const orm = await getAuthOrm(this.config.db);
    return orm.em.fork();
  }

  async save(payment: StoredOnboardingPayment): Promise<void> {
    const em = await this.em();
    const existing = await em.findOne(OnboardingPaymentRecord, {
      id: payment.id,
    });
    const target = existing ?? new OnboardingPaymentRecord();
    Object.assign(target, payment);
    if (!existing) em.persist(target);
    await em.flush();
  }

  async findByReference(
    reference: string,
  ): Promise<StoredOnboardingPayment | null> {
    const em = await this.em();
    const record = await em.findOne(OnboardingPaymentRecord, { reference });
    return record ? toStored(record) : null;
  }

  async findLatestForApplication(
    applicationId: string,
  ): Promise<StoredOnboardingPayment | null> {
    const em = await this.em();
    const record = await em.findOne(
      OnboardingPaymentRecord,
      { applicationId },
      { orderBy: { createdAt: 'desc' } },
    );
    return record ? toStored(record) : null;
  }

  async deleteForApplication(applicationId: string): Promise<void> {
    const em = await this.em();
    await em.nativeDelete(OnboardingPaymentRecord, { applicationId });
  }
}
