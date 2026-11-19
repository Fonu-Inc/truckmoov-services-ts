import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Matches, MaxLength, Max, Min } from 'class-validator';
import { StandardApiResponse } from '@shared/openapi';
import { QuotationLineSchema } from './billing-quotations.dto';

const SCOPES = ['open', 'paid', 'all'] as const;
const INVOICE_FILTERS = [...SCOPES, 'pending', 'partially_paid', 'overdue'] as const;
const STATUSES = ['issued', 'partially_paid', 'paid', 'overdue'] as const;
const QUOTATION_STATUSES = ['draft', 'sent', 'awaiting_decision', 'accepted', 'paid', 'expired', 'cancelled'] as const;
const PAYMENT_STATUSES = ['successful', 'pending', 'failed', 'refunded'] as const;
const PAYMENT_METHODS = ['card', 'bank_transfer', 'mtn_momo', 'wallet', 'other'] as const;

export class ListTenantInvoicesQueryDto {
  @ApiPropertyOptional({
    enum: INVOICE_FILTERS,
    default: 'all',
    description: 'open, paid and all are scopes; pending, partially_paid and overdue are exact states.',
  })
  @IsOptional() @IsIn(INVOICE_FILTERS) status?: (typeof INVOICE_FILTERS)[number];
  @ApiPropertyOptional({ description: 'Matches invoice number, quotation number, plan name or issue month.' })
  @IsOptional() @IsString() @MaxLength(100) q?: string;
  @ApiPropertyOptional({ default: 1 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @ApiPropertyOptional({ default: 20, maximum: 100 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize?: number;
}

export class TenantInvoiceSchema {
  @ApiProperty() id!: string;
  @ApiProperty({ example: 'INV-2026-004' }) number!: string;
  @ApiProperty({ enum: ['renewal', 'first'] }) kind!: string;
  @ApiProperty({ enum: STATUSES }) status!: string;
  @ApiProperty({ example: '2026-10-01' }) issueDate!: string;
  @ApiProperty({ example: '2026-10-08' }) dueDate!: string;
  @ApiProperty() totalNgn!: number;
  @ApiProperty() amountPaidNgn!: number;
  @ApiProperty() outstandingNgn!: number;
  @ApiProperty() daysOverdue!: number;
  @ApiProperty({ type: String, nullable: true, description: 'Last day of grace, only while unpaid.' }) graceEndsOn!: string | null;
  @ApiProperty({ description: 'True for an unpaid renewal invoice.' }) payable!: boolean;
  @ApiProperty({ type: String, nullable: true, description: 'Licence end date this invoice renews.' }) periodEnd!: string | null;
  @ApiProperty({ type: String, nullable: true }) planName!: string | null;
  @ApiProperty({ description: 'Devices on the plan line, 0 when the invoice has none.' }) deviceCount!: number;
  @ApiProperty({ example: 'Onboarding (October 2026)' }) billingPeriod!: string;
  @ApiProperty({ type: String, nullable: true }) quotationNumber!: string | null;
}

export class TenantInvoicePaymentSchema {
  @ApiProperty() reference!: string;
  @ApiProperty({ enum: PAYMENT_METHODS, nullable: true }) method!: string | null;
  @ApiProperty({ type: String, nullable: true }) paidAt!: string | null;
  @ApiProperty() amountNgn!: number;
}

export class TenantInvoiceDetailSchema extends TenantInvoiceSchema {
  @ApiProperty() subtotalNgn!: number;
  @ApiProperty() taxNgn!: number;
  @ApiProperty({ description: 'Basis points, 750 is 7.5%.' }) taxRateBp!: number;
  @ApiProperty({ type: [QuotationLineSchema] }) lines!: QuotationLineSchema[];
  @ApiProperty({ type: [TenantInvoicePaymentSchema], description: 'Successful payments only.' })
  payments!: TenantInvoicePaymentSchema[];
}

export class TenantInvoicesPageSchema {
  @ApiProperty({ type: [TenantInvoiceSchema] }) items!: TenantInvoiceSchema[];
  @ApiProperty() openTotalNgn!: number;
  @ApiProperty({ type: String, nullable: true }) nextDueDate!: string | null;
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() pageSize!: number;
}

export class TenantLicenceSchema {
  @ApiProperty() planCode!: string;
  @ApiProperty() planName!: string;
  @ApiProperty() deviceCount!: number;
  @ApiProperty({ example: '2026-01-01' }) periodStart!: string;
  @ApiProperty({ example: '2026-12-31', description: 'Last valid day.' }) periodEnd!: string;
  @ApiProperty() daysLeft!: number;
  @ApiProperty({ enum: ['active', 'renewed', 'ended'] }) status!: string;
  @ApiProperty({ type: String, nullable: true }) renewalInvoiceId!: string | null;
  @ApiProperty({ type: Number, nullable: true, description: 'Plan line unit price on the invoice that opened the term.' })
  pricePerDeviceNgn!: number | null;
  @ApiProperty({ type: Number, nullable: true }) renewalPricePerDeviceNgn!: number | null;
  @ApiProperty({ type: Number, nullable: true, description: 'Amount paid on that invoice, tax included.' })
  totalPaidNgn!: number | null;
  @ApiProperty({ type: Number, nullable: true }) validityDays!: number | null;
  @ApiProperty({ type: String, nullable: true }) invoiceNumber!: string | null;
  @ApiProperty({ type: Number, nullable: true, description: 'Devices fitted to a vehicle now; null when fleet cannot be reached.' })
  devicesInUse!: number | null;
  @ApiProperty({ type: Number, nullable: true, description: 'Active vehicles now; null when fleet cannot be reached.' })
  vehiclesInUse!: number | null;
  @ApiProperty({ type: Number, nullable: true, description: 'SIMs with a device or active status now.' })
  simsInUse!: number | null;
}

export class PayRenewalWalletSchema {
  @ApiProperty({ type: TenantInvoiceSchema }) invoice!: TenantInvoiceSchema;
  @ApiProperty() paidFromWalletNgn!: number;
  @ApiProperty({ type: String, nullable: true }) newPeriodEnd!: string | null;
}

export class PayRenewalCardSchema {
  @ApiProperty({ type: String, nullable: true }) authorizationUrl!: string | null;
  @ApiProperty() reference!: string;
  @ApiProperty() amountNgn!: number;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'Set when the server settled the renewal without a hosted checkout.' })
  newPeriodEnd?: string | null;
  @ApiPropertyOptional({ description: 'True when the server settled the renewal without a hosted checkout.' })
  paid?: boolean;
}

export class TenantInvoicesPageResponse extends StandardApiResponse<TenantInvoicesPageSchema> {
  @ApiProperty({ type: TenantInvoicesPageSchema }) data!: TenantInvoicesPageSchema;
}

export class TenantInvoiceDetailResponse extends StandardApiResponse<TenantInvoiceDetailSchema> {
  @ApiProperty({ type: TenantInvoiceDetailSchema }) data!: TenantInvoiceDetailSchema;
}

export class TenantLicenceResponse extends StandardApiResponse<TenantLicenceSchema | null> {
  @ApiProperty({ type: TenantLicenceSchema, nullable: true }) data!: TenantLicenceSchema | null;
}

export class PayRenewalWalletResponse extends StandardApiResponse<PayRenewalWalletSchema> {
  @ApiProperty({ type: PayRenewalWalletSchema }) data!: PayRenewalWalletSchema;
}

export class PayRenewalCardResponse extends StandardApiResponse<PayRenewalCardSchema> {
  @ApiProperty({ type: PayRenewalCardSchema }) data!: PayRenewalCardSchema;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export class ListTenantQuotationsQueryDto {
  @ApiPropertyOptional({ description: 'Matches quotation number, application reference or line name.' })
  @IsOptional() @IsString() @MaxLength(100) q?: string;
  @ApiPropertyOptional({ enum: QUOTATION_STATUSES })
  @IsOptional() @IsIn(QUOTATION_STATUSES) status?: (typeof QUOTATION_STATUSES)[number];
  @ApiPropertyOptional({ default: 1 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @ApiPropertyOptional({ default: 20, maximum: 100 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize?: number;
}

export class TenantQuotationSchema {
  @ApiProperty() id!: string;
  @ApiProperty({ example: 'QT-2026-001' }) number!: string;
  @ApiProperty({ example: '2026-10-01' }) date!: string;
  @ApiProperty() planName!: string;
  @ApiProperty() deviceCount!: number;
  @ApiProperty() description!: string;
  @ApiProperty() purpose!: string;
  @ApiProperty({ enum: ['Onboarding'] }) category!: string;
  @ApiProperty({ enum: QUOTATION_STATUSES }) status!: string;
  @ApiProperty({ type: String, nullable: true, example: 'Application ONB-2026-0001' }) relatedRequest!: string | null;
  @ApiProperty() totalNgn!: number;
  @ApiProperty({ type: String, nullable: true }) paymentRef!: string | null;
  @ApiProperty() operationalOutcome!: string;
}

export class TenantQuotationDetailSchema extends TenantQuotationSchema {
  @ApiProperty({ type: String, nullable: true }) invoiceNumber!: string | null;
  @ApiProperty() validUntil!: string;
  @ApiProperty() subtotalNgn!: number;
  @ApiProperty() discountNgn!: number;
  @ApiProperty() taxNgn!: number;
  @ApiProperty({ description: 'Basis points, 750 is 7.5%.' }) taxRateBp!: number;
  @ApiProperty({ type: [QuotationLineSchema] }) lines!: QuotationLineSchema[];
}

export class TenantQuotationsPageSchema {
  @ApiProperty({ type: [TenantQuotationSchema] }) items!: TenantQuotationSchema[];
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() pageSize!: number;
}

export class ListTenantPaymentsQueryDto {
  @ApiPropertyOptional({ description: 'Matches reference, invoice number, quotation number or plan name.' })
  @IsOptional() @IsString() @MaxLength(100) q?: string;
  @ApiPropertyOptional({ enum: PAYMENT_STATUSES })
  @IsOptional() @IsIn(PAYMENT_STATUSES) status?: (typeof PAYMENT_STATUSES)[number];
  @ApiPropertyOptional({ enum: PAYMENT_METHODS })
  @IsOptional() @IsIn(PAYMENT_METHODS) method?: (typeof PAYMENT_METHODS)[number];
  @ApiPropertyOptional({ example: '2026-01-01', description: 'First day, Lagos calendar.' })
  @IsOptional() @Matches(DAY) from?: string;
  @ApiPropertyOptional({ example: '2026-12-31', description: 'Last day, Lagos calendar.' })
  @IsOptional() @Matches(DAY) to?: string;
  @ApiPropertyOptional({ default: 1 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @ApiPropertyOptional({ default: 20, maximum: 100 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize?: number;
}

export class TenantPaymentSchema {
  @ApiProperty() id!: string;
  @ApiProperty() reference!: string;
  @ApiProperty({ description: 'Paid time, or created time while unpaid. ISO 8601.' }) date!: string;
  @ApiProperty() planName!: string;
  @ApiProperty() deviceCount!: number;
  @ApiProperty() amountNgn!: number;
  @ApiProperty({ enum: PAYMENT_METHODS, nullable: true }) method!: string | null;
  @ApiProperty({ enum: PAYMENT_STATUSES }) status!: string;
  @ApiProperty({ type: String, nullable: true }) invoiceNumber!: string | null;
  @ApiProperty({ type: String, nullable: true }) quotationNumber!: string | null;
  @ApiProperty({ example: 'M2M Standard — 2 devices (year one)' }) paidFor!: string;
}

export class TenantPaymentDetailSchema extends TenantPaymentSchema {
  @ApiProperty({ type: TenantInvoiceDetailSchema, nullable: true }) relatedInvoice!: TenantInvoiceDetailSchema | null;
  @ApiProperty({ type: TenantQuotationDetailSchema, nullable: true })
  relatedQuotation!: TenantQuotationDetailSchema | null;
}

export class TenantPaymentsPageSchema {
  @ApiProperty({ type: [TenantPaymentSchema] }) items!: TenantPaymentSchema[];
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() pageSize!: number;
}

export class TenantBillingSummarySchema {
  @ApiProperty() outstandingNgn!: number;
  @ApiProperty({ type: String, nullable: true }) nextDueDate!: string | null;
  @ApiProperty({ description: 'Successful payments dated in the current Lagos year.' }) paidThisYearNgn!: number;
  @ApiProperty() walletBalanceNgn!: number;
}

export class TenantSpendMonthSchema {
  @ApiProperty({ example: '2026-10', description: 'Lagos calendar month.' }) month!: string;
  @ApiProperty() invoicedNgn!: number;
  @ApiProperty() paidNgn!: number;
}

export class TenantSpendCategorySchema {
  @ApiProperty({ enum: ['Licensing', 'Installation'] }) name!: string;
  @ApiProperty() valueNgn!: number;
}

export class TenantOutstandingPointSchema {
  @ApiProperty({ example: '2026-10-01' }) date!: string;
  @ApiProperty() invoiceNumber!: string;
  @ApiProperty() outstandingNgn!: number;
}

export class TenantBillingOverviewSchema {
  @ApiProperty({ type: TenantBillingSummarySchema }) summary!: TenantBillingSummarySchema;
  @ApiProperty({ type: [TenantSpendMonthSchema] }) spendTrend!: TenantSpendMonthSchema[];
  @ApiProperty({ type: [TenantSpendCategorySchema] }) spendByCategory!: TenantSpendCategorySchema[];
  @ApiProperty({ type: [TenantOutstandingPointSchema], description: 'Every invoice, oldest first.' })
  outstandingTrend!: TenantOutstandingPointSchema[];
}

export class ListTenantActivityQueryDto {
  @ApiPropertyOptional({ description: 'Matches event or resource.' })
  @IsOptional() @IsString() @MaxLength(100) q?: string;
  @ApiPropertyOptional({ description: 'Exact event name, one of the events the response lists.' })
  @IsOptional() @IsString() @MaxLength(60) event?: string;
  @ApiPropertyOptional({ default: 1 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @ApiPropertyOptional({ default: 20, maximum: 100 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize?: number;
}

export class TenantActivitySchema {
  @ApiProperty() id!: string;
  @ApiProperty({ example: '2026-10-01' }) date!: string;
  @ApiProperty({ example: 'Invoice Issued' }) event!: string;
  @ApiProperty() resource!: string;
  @ApiProperty({ type: Number, nullable: true, description: 'Positive adds to what you owe, negative is a payment, null is no charge.' })
  impactNgn!: number | null;
}

export class TenantActivityPageSchema {
  @ApiProperty({ type: [TenantActivitySchema] }) items!: TenantActivitySchema[];
  @ApiProperty({ type: [String], description: 'Every event name present, ignoring the filters.' }) events!: string[];
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() pageSize!: number;
}

export class TenantQuotationsPageResponse extends StandardApiResponse<TenantQuotationsPageSchema> {
  @ApiProperty({ type: TenantQuotationsPageSchema }) data!: TenantQuotationsPageSchema;
}

export class TenantQuotationDetailResponse extends StandardApiResponse<TenantQuotationDetailSchema> {
  @ApiProperty({ type: TenantQuotationDetailSchema }) data!: TenantQuotationDetailSchema;
}

export class TenantPaymentsPageResponse extends StandardApiResponse<TenantPaymentsPageSchema> {
  @ApiProperty({ type: TenantPaymentsPageSchema }) data!: TenantPaymentsPageSchema;
}

export class TenantPaymentDetailResponse extends StandardApiResponse<TenantPaymentDetailSchema> {
  @ApiProperty({ type: TenantPaymentDetailSchema }) data!: TenantPaymentDetailSchema;
}

export class TenantBillingOverviewResponse extends StandardApiResponse<TenantBillingOverviewSchema> {
  @ApiProperty({ type: TenantBillingOverviewSchema }) data!: TenantBillingOverviewSchema;
}

export class TenantActivityPageResponse extends StandardApiResponse<TenantActivityPageSchema> {
  @ApiProperty({ type: TenantActivityPageSchema }) data!: TenantActivityPageSchema;
}
