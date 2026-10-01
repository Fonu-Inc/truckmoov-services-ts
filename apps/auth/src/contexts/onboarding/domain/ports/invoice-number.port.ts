export type AllocatedInvoiceNumber = {
  number: string;
  prefix: string;
  year: number;
  sequence: number;
};

export interface InvoiceNumberAllocator {
  next(issuedAt: Date): Promise<AllocatedInvoiceNumber>;
}

export const INVOICE_NUMBER_ALLOCATOR = Symbol('INVOICE_NUMBER_ALLOCATOR');
