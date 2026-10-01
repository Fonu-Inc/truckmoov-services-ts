export type InvoiceEmail = {
  email: string;
  customerName: string;
  invoiceNumber: string;
  issueDate: string;
  dueDate: string;
  totalNgn: number;
  amountPaidNgn: number;
  outstandingNgn: number;
};

export interface InvoiceNotifier {
  /** Throws when the mail could not be sent. */
  sendInvoice(input: InvoiceEmail): Promise<void>;
}

export const INVOICE_NOTIFIER = Symbol('INVOICE_NOTIFIER');
