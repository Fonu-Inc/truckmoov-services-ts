export type BillingSummaryTotals = {
  activePlans: number;
  quotationsCount: number;
  outstandingKobo: number;
  collectedKobo: number;
};

export interface BillingSummaryRepository {
  totals(): Promise<BillingSummaryTotals>;
}

export const BILLING_SUMMARY_REPOSITORY = Symbol('BILLING_SUMMARY_REPOSITORY');
