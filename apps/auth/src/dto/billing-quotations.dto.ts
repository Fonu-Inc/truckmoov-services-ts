import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { StandardApiResponse } from '@shared/openapi';

const QUOTATION_STATUSES = ['draft', 'pending_review', 'sent', 'accepted', 'expired', 'cancelled'] as const;
const PAYMENT_STATUSES = ['complete', 'incomplete'] as const;

export class ListQuotationsQueryDto {
  @ApiPropertyOptional({ description: 'Matches the quotation number or customer name.' })
  @IsOptional() @IsString() q?: string;
  @ApiPropertyOptional({ enum: QUOTATION_STATUSES, description: 'Status with expiry applied.' })
  @IsOptional() @IsIn(QUOTATION_STATUSES) status?: (typeof QUOTATION_STATUSES)[number];
  @ApiPropertyOptional({ enum: PAYMENT_STATUSES })
  @IsOptional() @IsIn(PAYMENT_STATUSES) paymentStatus?: (typeof PAYMENT_STATUSES)[number];
  @ApiPropertyOptional({ default: 1 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @ApiPropertyOptional({ default: 20, maximum: 100 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number;
}

export class QuotationRowSchema {
  @ApiProperty() id!: string;
  @ApiProperty({ example: 'QT-2026-0001' }) number!: string;
  @ApiProperty() customerName!: string;
  @ApiProperty({ type: String, nullable: true, description: 'Plan line name, null when the quotation has none.' }) productName!: string | null;
  @ApiProperty() deviceCount!: number;
  @ApiProperty() customerType!: string;
  @ApiProperty() billingEmail!: string;
  @ApiProperty({ enum: QUOTATION_STATUSES }) status!: string;
  @ApiProperty() createdAt!: string;
  @ApiProperty() validUntil!: string;
  @ApiProperty() subtotalNgn!: number;
  @ApiProperty() discountNgn!: number;
  @ApiProperty({ description: 'Basis points, 750 is 7.5%.' }) taxRateBp!: number;
  @ApiProperty() taxNgn!: number;
  @ApiProperty() totalNgn!: number;
  @ApiProperty({ description: 'Sum of successful payments linked to the quotation.' }) paidNgn!: number;
  @ApiProperty() outstandingNgn!: number;
  @ApiProperty() paymentComplete!: boolean;
  @ApiProperty() lineCount!: number;
}

export class QuotationLineSchema {
  @ApiProperty({ enum: ['plan', 'installation'] }) kind!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ type: String, nullable: true }) description!: string | null;
  @ApiProperty() quantity!: number;
  @ApiProperty() unitPriceNgn!: number;
  @ApiProperty() lineTotalNgn!: number;
  @ApiProperty({ type: Number, nullable: true }) validityDays!: number | null;
  @ApiProperty({ type: [String] }) components!: string[];
}

export class QuotationPaymentSchema {
  @ApiProperty() reference!: string;
  @ApiProperty() amountNgn!: number;
  @ApiProperty({ enum: ['pending', 'successful', 'failed', 'requires_review', 'refunded'] }) status!: string;
  @ApiProperty({ type: String, nullable: true }) paidAt!: string | null;
}

export class QuotationDetailSchema extends QuotationRowSchema {
  @ApiProperty({ type: [QuotationLineSchema] }) lines!: QuotationLineSchema[];
  @ApiProperty({ type: [QuotationPaymentSchema] }) payments!: QuotationPaymentSchema[];
}

export class QuotationsPageSchema {
  @ApiProperty({ type: [QuotationRowSchema] }) items!: QuotationRowSchema[];
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() limit!: number;
}

export class QuotationsPageResponse extends StandardApiResponse<QuotationsPageSchema> {
  @ApiProperty({ type: QuotationsPageSchema }) data!: QuotationsPageSchema;
}

export class QuotationDetailResponse extends StandardApiResponse<QuotationDetailSchema> {
  @ApiProperty({ type: QuotationDetailSchema }) data!: QuotationDetailSchema;
}
