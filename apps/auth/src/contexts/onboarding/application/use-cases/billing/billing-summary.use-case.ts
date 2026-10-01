import { Inject, Injectable } from '@nestjs/common';
import {
  BILLING_SUMMARY_REPOSITORY,
  type BillingSummaryRepository,
} from '@auth/onboarding/domain/billing-summary.repository';
import { koboToNgn } from '@auth/onboarding/domain/quotation-totals';
import { success } from './billing-views';

@Injectable()
export class GetBillingSummaryUseCase {
  constructor(
    @Inject(BILLING_SUMMARY_REPOSITORY) private readonly summary: BillingSummaryRepository,
  ) {}

  async execute() {
    const totals = await this.summary.totals();
    return success({
      activePlans: totals.activePlans,
      quotationsCount: totals.quotationsCount,
      outstandingNgn: koboToNgn(totals.outstandingKobo),
      collectedNgn: koboToNgn(totals.collectedKobo),
    });
  }
}
