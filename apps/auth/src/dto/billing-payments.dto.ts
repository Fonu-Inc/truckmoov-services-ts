import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { StandardApiResponse } from '@shared/openapi';

const PAYMENT_STATUSES = ['pending', 'successful', 'failed', 'requires_review', 'refunded'] as const;
const PAYMENT_METHODS = ['card', 'bank_transfer', 'mtn_momo', 'other'] as const;

export class ListPaymentsQueryDto {
  @ApiPropertyOptional({ description: 'Matches the reference, customer name or quotation number.' })
  @IsOptional() @IsString() q?: string;
  @ApiPropertyOptional({ enum: PAYMENT_STATUSES })
  @IsOptional() @IsIn(PAYMENT_STATUSES) status?: (typeof PAYMENT_STATUSES)[number];
  @ApiPropertyOptional({ enum: PAYMENT_METHODS })
  @IsOptional() @IsIn(PAYMENT_METHODS) method?: (typeof PAYMENT_METHODS)[number];
  @ApiPropertyOptional({ default: 1 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @ApiPropertyOptional({ default: 20, maximum: 100 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number;
}

export class PaymentRowSchema {
  @ApiProperty() id!: string;
  @ApiProperty() reference!: string;
  @ApiProperty() customerName!: string;
  @ApiProperty({ type: String, nullable: true }) quotationId!: string | null;
  @ApiProperty({ type: String, nullable: true }) quotationNumber!: string | null;
  @ApiProperty({ type: String, nullable: true }) invoiceId!: string | null;
  @ApiProperty({ type: String, nullable: true }) invoiceNumber!: string | null;
  @ApiProperty() productName!: string;
  @ApiProperty() deviceCount!: number;
  @ApiProperty() amountNgn!: number;
  @ApiProperty({ enum: PAYMENT_METHODS, nullable: true, description: 'Null until the provider reports a channel.' }) method!: string | null;
  @ApiProperty({ enum: PAYMENT_STATUSES }) status!: string;
  @ApiProperty({ type: String, nullable: true }) paidAt!: string | null;
  @ApiProperty() createdAt!: string;
}

export class PaymentBreakdownSchema {
  @ApiProperty() planCode!: string;
  @ApiProperty() planName!: string;
  @ApiProperty() deviceCount!: number;
  @ApiProperty() perDeviceNgn!: number;
  @ApiProperty() devicesNgn!: number;
  @ApiProperty() installationPerDeviceNgn!: number;
  @ApiProperty() installationNgn!: number;
  @ApiProperty() subtotalNgn!: number;
  @ApiProperty() taxRateBp!: number;
  @ApiProperty() taxNgn!: number;
  @ApiProperty() totalNgn!: number;
}

export class PaymentDetailSchema extends PaymentRowSchema {
  @ApiProperty() provider!: string;
  @ApiProperty() billingEmail!: string;
  @ApiProperty({ type: String, nullable: true }) note!: string | null;
  @ApiProperty() autoReconciled!: boolean;
  @ApiProperty({ type: PaymentBreakdownSchema, nullable: true }) breakdown!: PaymentBreakdownSchema | null;
}

export class PaymentsPageSchema {
  @ApiProperty({ type: [PaymentRowSchema] }) items!: PaymentRowSchema[];
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() limit!: number;
}

export class PaymentsPageResponse extends StandardApiResponse<PaymentsPageSchema> {
  @ApiProperty({ type: PaymentsPageSchema }) data!: PaymentsPageSchema;
}

export class PaymentDetailResponse extends StandardApiResponse<PaymentDetailSchema> {
  @ApiProperty({ type: PaymentDetailSchema }) data!: PaymentDetailSchema;
}
