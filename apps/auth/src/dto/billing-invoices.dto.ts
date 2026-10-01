import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { StandardApiResponse } from '@shared/openapi';
import { QuotationLineSchema } from './billing-quotations.dto';

const INVOICE_STATUSES = ['draft', 'issued', 'partially_paid', 'paid', 'overdue', 'cancelled'] as const;
const PAYMENT_STATUSES = ['pending', 'successful', 'failed', 'requires_review', 'refunded'] as const;
const PAYMENT_METHODS = ['card', 'bank_transfer', 'mtn_momo', 'wallet', 'other'] as const;

export class ListInvoicesQueryDto {
  @ApiPropertyOptional({ description: 'Matches the invoice number, customer name or quotation number.' })
  @IsOptional() @IsString() q?: string;
  @ApiPropertyOptional({ enum: INVOICE_STATUSES, description: 'Status with overdue derived from the due date.' })
  @IsOptional() @IsIn(INVOICE_STATUSES) status?: (typeof INVOICE_STATUSES)[number];
  @ApiPropertyOptional({ enum: ['renewal', 'first'], description: 'Licence renewals or first-purchase invoices only.' })
  @IsOptional() @IsIn(['renewal', 'first']) kind?: 'renewal' | 'first';
  @ApiPropertyOptional({ default: 1 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @ApiPropertyOptional({ default: 20, maximum: 100 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number;
}

export class InvoiceRowSchema {
  @ApiProperty() id!: string;
  @ApiProperty({ example: 'INV-2026-001' }) number!: string;
  @ApiProperty({ type: String, nullable: true }) quotationId!: string | null;
  @ApiProperty({ type: String, nullable: true }) quotationNumber!: string | null;
  @ApiProperty({ type: String, nullable: true }) tenantId!: string | null;
  @ApiProperty({ description: 'True for a licence renewal invoice.' }) isRenewal!: boolean;
  @ApiProperty({ type: String, nullable: true, description: 'Licence end date a renewal invoice covers.' }) periodEnd!: string | null;
  @ApiProperty() customerName!: string;
  @ApiProperty() customerType!: string;
  @ApiProperty({ enum: INVOICE_STATUSES }) status!: string;
  @ApiProperty({ example: '2026-10-02', description: 'Lagos calendar date.' }) issueDate!: string;
  @ApiProperty({ example: '2026-10-17' }) dueDate!: string;
  @ApiProperty() subtotalNgn!: number;
  @ApiProperty() discountNgn!: number;
  @ApiProperty() taxNgn!: number;
  @ApiProperty() totalNgn!: number;
  @ApiProperty() amountPaidNgn!: number;
  @ApiProperty() outstandingNgn!: number;
  @ApiProperty({ type: String, nullable: true }) emailedAt!: string | null;
}

export class InvoicePaymentSchema {
  @ApiProperty() reference!: string;
  @ApiProperty({ enum: PAYMENT_METHODS, nullable: true }) method!: string | null;
  @ApiProperty() amountNgn!: number;
  @ApiProperty({ type: String, nullable: true }) paidAt!: string | null;
  @ApiProperty({ enum: PAYMENT_STATUSES }) status!: string;
}

export class InvoiceDetailSchema extends InvoiceRowSchema {
  @ApiProperty() billingEmail!: string;
  @ApiProperty({ description: 'Basis points, 750 is 7.5%.' }) taxRateBp!: number;
  @ApiProperty({ type: [QuotationLineSchema] }) lines!: QuotationLineSchema[];
  @ApiProperty({ type: [InvoicePaymentSchema] }) payments!: InvoicePaymentSchema[];
}

export class InvoicesPageSchema {
  @ApiProperty({ type: [InvoiceRowSchema] }) items!: InvoiceRowSchema[];
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() limit!: number;
}

export class InvoicesPageResponse extends StandardApiResponse<InvoicesPageSchema> {
  @ApiProperty({ type: InvoicesPageSchema }) data!: InvoicesPageSchema;
}

export class InvoiceDetailResponse extends StandardApiResponse<InvoiceDetailSchema> {
  @ApiProperty({ type: InvoiceDetailSchema }) data!: InvoiceDetailSchema;
}

export class BillingSummarySchema {
  @ApiProperty({ description: 'Active M2M licence plans.' }) activePlans!: number;
  @ApiProperty({ description: 'Quotations excluding draft and cancelled.' }) quotationsCount!: number;
  @ApiProperty({ description: 'Unpaid balance on issued, partially paid and overdue invoices.' }) outstandingNgn!: number;
  @ApiProperty({ description: 'Sum of successful payments.' }) collectedNgn!: number;
}

export class BillingSummaryResponse extends StandardApiResponse<BillingSummarySchema> {
  @ApiProperty({ type: BillingSummarySchema }) data!: BillingSummarySchema;
}
