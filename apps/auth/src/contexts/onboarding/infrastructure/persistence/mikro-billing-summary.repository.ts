import { Inject, Injectable } from '@nestjs/common';
import { AppConfigService } from '@shared/config';
import { getAuthOrm } from '@auth/session/infrastructure/persistence/auth-orm';
import type {
  BillingSummaryRepository,
  BillingSummaryTotals,
} from '@auth/onboarding/domain/billing-summary.repository';

@Injectable()
export class MikroBillingSummaryRepository implements BillingSummaryRepository {
  constructor(
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  async totals(): Promise<BillingSummaryTotals> {
    const orm = await getAuthOrm(this.config.db);
    const rows = await orm.em.fork().getConnection().execute<Array<Record<string, unknown>>>(
      `select
         (select count(*) from m2m_license_plans where is_active) as active_plans,
         (select count(*) from billing_quotations
           where status not in ('draft', 'cancelled')) as quotations_count,
         (select coalesce(sum(total_kobo - amount_paid_kobo), 0) from billing_invoices
           where status in ('issued', 'partially_paid', 'overdue')
             and total_kobo > amount_paid_kobo) as outstanding_kobo,
         (select coalesce(sum(amount_kobo), 0) from onboarding_payments
           where status = 'paid') as collected_kobo`,
    );
    const row = rows[0] ?? {};
    return {
      activePlans: Number(row.active_plans ?? 0),
      quotationsCount: Number(row.quotations_count ?? 0),
      outstandingKobo: Number(row.outstanding_kobo ?? 0),
      collectedKobo: Number(row.collected_kobo ?? 0),
    };
  }
}
