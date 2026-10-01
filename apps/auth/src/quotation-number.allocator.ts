import { Inject, Injectable } from '@nestjs/common';
import type {
  AllocatedQuotationNumber,
  QuotationNumberAllocator,
} from '@auth/onboarding/domain/ports/quotation-number.port';
import { InvoiceNumberService } from './invoice-number.service';

@Injectable()
export class InvoiceSeriesQuotationNumbers implements QuotationNumberAllocator {
  constructor(
    @Inject(InvoiceNumberService) private readonly numbers: InvoiceNumberService,
  ) {}

  async next(issuedAt: Date): Promise<AllocatedQuotationNumber> {
    const allocated = await this.numbers.allocatePlatform('quotation', issuedAt);
    return {
      number: allocated.invoiceNumber,
      prefix: allocated.prefix,
      year: allocated.year,
      sequence: allocated.sequence,
    };
  }
}
