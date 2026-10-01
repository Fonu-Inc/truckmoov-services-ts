import { Inject, Injectable } from '@nestjs/common';
import type {
  AllocatedInvoiceNumber,
  InvoiceNumberAllocator,
} from '@auth/onboarding/domain/ports/invoice-number.port';
import { InvoiceNumberService } from './invoice-number.service';

@Injectable()
export class InvoiceSeriesInvoiceNumbers implements InvoiceNumberAllocator {
  constructor(
    @Inject(InvoiceNumberService) private readonly numbers: InvoiceNumberService,
  ) {}

  async next(issuedAt: Date): Promise<AllocatedInvoiceNumber> {
    const allocated = await this.numbers.allocatePlatform('platform_subscription', issuedAt);
    return {
      number: allocated.invoiceNumber,
      prefix: allocated.prefix,
      year: allocated.year,
      sequence: allocated.sequence,
    };
  }
}
