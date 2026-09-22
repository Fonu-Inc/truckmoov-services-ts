import { Injectable } from '@nestjs/common';
import type {
  OnboardingPaymentRepository,
  StoredOnboardingPayment,
} from '@auth/onboarding/domain/onboarding-payment.repository';

@Injectable()
export class InMemoryOnboardingPaymentRepository
  implements OnboardingPaymentRepository
{
  private readonly payments = new Map<string, StoredOnboardingPayment>();

  async save(payment: StoredOnboardingPayment): Promise<void> {
    this.payments.set(payment.id, { ...payment });
  }

  async findByReference(
    reference: string,
  ): Promise<StoredOnboardingPayment | null> {
    return (
      [...this.payments.values()].find(
        (payment) => payment.reference === reference,
      ) ?? null
    );
  }

  async findLatestForApplication(
    applicationId: string,
  ): Promise<StoredOnboardingPayment | null> {
    return (
      [...this.payments.values()]
        .filter((payment) => payment.applicationId === applicationId)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ?? null
    );
  }

  async deleteForApplication(applicationId: string): Promise<void> {
    for (const [id, payment] of this.payments) {
      if (payment.applicationId === applicationId) this.payments.delete(id);
    }
  }
}
