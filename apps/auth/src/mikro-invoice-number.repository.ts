import { Inject, Injectable } from '@nestjs/common';
import { AppConfigService } from '@shared/config';
import { getAuthOrm } from './contexts/auth/session/infrastructure/persistence/auth-orm';
import type {
  InvoiceNumberRepository,
  InvoiceSeries,
} from './invoice-number.repository';

@Injectable()
export class MikroInvoiceNumberRepository implements InvoiceNumberRepository {
  constructor(@Inject(AppConfigService) private readonly config: AppConfigService) {}

  async allocate(series: InvoiceSeries, scope: string, year: number): Promise<number> {
    const orm = await getAuthOrm(this.config.db);
    // One statement does the insert, the increment and the read. Nothing between
    // them can interleave, so the sequence cannot repeat a number or skip one.
    const rows = await orm.em.getConnection().execute<Array<{ allocated: string }>>(
      `insert into invoice_number_sequences (series, scope, year, next_value)
         values (?, ?, ?, 2)
       on conflict (series, scope, year)
         do update set next_value = invoice_number_sequences.next_value + 1
       returning next_value - 1 as allocated`,
      [series, scope, year],
    );

    const allocated = Number(rows[0]?.allocated ?? 0);
    if (!allocated) throw new Error('Failed to allocate an invoice number');
    return allocated;
  }

  async peek(series: InvoiceSeries, scope: string, year: number): Promise<number> {
    const orm = await getAuthOrm(this.config.db);
    const rows = await orm.em.getConnection().execute<Array<{ next_value: string }>>(
      `select next_value from invoice_number_sequences
        where series = ? and scope = ? and year = ? limit 1`,
      [series, scope, year],
    );
    return Number(rows[0]?.next_value ?? 1);
  }
}
