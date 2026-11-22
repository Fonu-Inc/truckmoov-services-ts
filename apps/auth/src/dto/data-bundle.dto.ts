import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize, IsArray, IsIn, IsInt, IsISO8601, IsNumber, IsOptional, IsString, Max, MaxLength, Min, MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';

export class TopUpWalletDto {
  @ApiProperty({ description: 'Amount in Naira' }) @IsNumber() @Min(1) amount!: number;
  @ApiProperty() @IsString() mobileMoneyProvider!: string;
  @ApiProperty() @IsString() mobileNumber!: string;
}

export class SaveSpendingLimitDto {
  @ApiProperty({ description: 'Monthly limit in Naira' }) @IsNumber() @Min(0) monthlyLimit!: number;
  @ApiProperty() @IsInt() @Min(1) resetDayOfMonth!: number;
  @ApiProperty() @IsString() alertEmail!: string;
  @ApiPropertyOptional({ type: [Number] }) @IsOptional() @IsArray() @ArrayMaxSize(10) @IsInt({ each: true }) notifyAtPercentages?: number[];
}

export class SaveAutoTopUpDto {
  @ApiProperty({ description: 'Threshold in Naira' }) @IsNumber() @Min(0) thresholdAmount!: number;
  @ApiProperty({ description: 'Top-up amount in Naira' }) @IsNumber() @Min(1) topUpAmount!: number;
  @ApiProperty() @IsString() paymentProvider!: string;
  @ApiProperty() @IsString() mobileNumber!: string;
}

export class AllocateBundleDto {
  @ApiProperty() @IsString() carrierId!: string;
  @ApiProperty() @IsString() planType!: string;
  @ApiProperty() @IsString() bundleId!: string;
  @ApiProperty({ type: [String] }) @IsArray() @ArrayMaxSize(500) @IsString({ each: true }) @MinLength(1, { each: true }) mobileNumbers!: string[];
  @ApiPropertyOptional({ description: 'Client key making a retry return the original purchase' }) @IsOptional() @IsString() @MinLength(1) @MaxLength(100) idempotencyKey?: string;
}

export class ListAllocationsQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() search?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() status?: string;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) billingCycles?: string[];
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Type(() => Number) page?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(100) @Type(() => Number) limit?: number;
  @ApiPropertyOptional({ enum: ['csv', 'xlsx'] }) @IsOptional() @IsIn(['csv', 'xlsx']) format?: 'csv' | 'xlsx';
}

export class ListTransactionsQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() search?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() status?: string;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @ArrayMaxSize(50) @IsString({ each: true }) carriers?: string[];
  @ApiPropertyOptional() @IsOptional() @IsString() startDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() endDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Type(() => Number) page?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(100) @Type(() => Number) limit?: number;
  @ApiPropertyOptional({ enum: ['csv', 'xlsx'] }) @IsOptional() @IsIn(['csv', 'xlsx']) format?: 'csv' | 'xlsx';
}

export class AnalyticsRangeDto {
  @ApiPropertyOptional({ enum: ['7d', '30d', '90d', 'custom'] })
  @IsOptional() @IsIn(['7d', '30d', '90d', 'custom']) range?: '7d' | '30d' | '90d' | 'custom';
  @ApiPropertyOptional() @IsOptional() @IsString() startDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() endDate?: string;
}

export class ListBundleRatesQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() search?: string;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @ArrayMaxSize(50) @IsString({ each: true }) carriers?: string[];
  @ApiPropertyOptional() @IsOptional() @IsString() planType?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Type(() => Number) page?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(100) @Type(() => Number) limit?: number;
  @ApiPropertyOptional({ enum: ['csv', 'xlsx'] }) @IsOptional() @IsIn(['csv', 'xlsx']) format?: 'csv' | 'xlsx';
}

export class WalletLedgerQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() category?: string;
  @ApiPropertyOptional({ enum: ['debit', 'credit'] }) @IsOptional() @IsIn(['debit', 'credit']) direction?: 'debit' | 'credit';
  @ApiPropertyOptional({ description: 'ISO 8601 instant, inclusive' }) @IsOptional() @IsISO8601() from?: string;
  @ApiPropertyOptional({ description: 'ISO 8601 instant, inclusive' }) @IsOptional() @IsISO8601() to?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Type(() => Number) page?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(100) @Type(() => Number) limit?: number;
}

export class CrossTenantLedgerQueryDto extends WalletLedgerQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() query?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() tenantId?: string;
}
