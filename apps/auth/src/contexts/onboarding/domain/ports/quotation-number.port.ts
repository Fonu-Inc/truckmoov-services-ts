export type AllocatedQuotationNumber = {
  number: string;
  prefix: string;
  year: number;
  sequence: number;
};

export interface QuotationNumberAllocator {
  next(issuedAt: Date): Promise<AllocatedQuotationNumber>;
}

export const QUOTATION_NUMBER_ALLOCATOR = Symbol('QUOTATION_NUMBER_ALLOCATOR');
