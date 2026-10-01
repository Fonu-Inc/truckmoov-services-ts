import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { StandardApiResponse } from '@shared/openapi';
import { QuotationLineSchema } from './billing-quotations.dto';

const SCOPES = ['open', 'paid', 'all'] as const;
const STATUSES = ['issued', 'partially_paid', 'paid', 'overdue'] as const;

export class ListTenantInvoicesQueryDto {
  @ApiPropertyOptional({ enum: SCOPES, default: 'all' })
  @IsOptional() @IsIn(SCOPES) status?: (typeof SCOPES)[number];
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
}

export class TenantInvoiceDetailSchema extends TenantInvoiceSchema {
  @ApiProperty() subtotalNgn!: number;
  @ApiProperty() taxNgn!: number;
  @ApiProperty({ description: 'Basis points, 750 is 7.5%.' }) taxRateBp!: number;
  @ApiProperty({ type: [QuotationLineSchema] }) lines!: QuotationLineSchema[];
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
