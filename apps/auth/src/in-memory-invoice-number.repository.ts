import { Injectable } from '@nestjs/common';
import type {
  InvoiceNumberRepository,
  InvoiceSeries,
} from './invoice-number.repository';

@Injectable()
export class InMemoryInvoiceNumberRepository implements InvoiceNumberRepository {
  private readonly counters = new Map<string, number>();

  async allocate(series: InvoiceSeries, scope: string, year: number): Promise<number> {
    const key = keyFor(series, scope, year);
    const allocated = this.counters.get(key) ?? 1;
    this.counters.set(key, allocated + 1);
    return allocated;
  }

  async peek(series: InvoiceSeries, scope: string, year: number): Promise<number> {
    return this.counters.get(keyFor(series, scope, year)) ?? 1;
  }
}

function keyFor(series: InvoiceSeries, scope: string, year: number): string {
  return `${series}::${scope}::${year}`;
}
