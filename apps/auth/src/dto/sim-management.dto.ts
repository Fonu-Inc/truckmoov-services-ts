import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize, IsArray, IsIn, IsInt, IsNumber, IsOptional, IsString, Max, Min, MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';

export class RegisterTenantSimDto {
  @ApiProperty() @IsString() @MinLength(1) iccid!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() imsi?: string;
  @ApiProperty() @IsString() mobileNumber!: string;
  @ApiProperty() @IsString() operator!: string;
  @ApiProperty() @IsNumber() @Min(0) dataLimitGb!: number;
  @ApiPropertyOptional() @IsOptional() @IsString() simType?: string;
  @ApiProperty() @IsNumber() @Min(0) monthlyRentalNaira!: number;
}

export class UpdateTenantSimDto {
  @ApiPropertyOptional() @IsOptional() @IsString() iccid?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() imsi?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() mobileNumber?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() operator?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) dataLimitGb?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() simType?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) monthlyRentalNaira?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}

export class SuspendSimDto {
  @ApiPropertyOptional() @IsOptional() @IsString() reason?: string;
}

export class ListSimsQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() search?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() status?: string;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @ArrayMaxSize(50) @IsString({ each: true }) operators?: string[];
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Type(() => Number) page?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(500) @Type(() => Number) limit?: number;
  @ApiPropertyOptional({ enum: ['csv', 'xlsx'] }) @IsOptional() @IsIn(['csv', 'xlsx']) format?: 'csv' | 'xlsx';
}

export class PageQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Type(() => Number) page?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(100) @Type(() => Number) limit?: number;
}

export class ListSystemBundleCatalogQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() carrierId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() billingCycle?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() search?: string;
  @ApiPropertyOptional({ enum: ['all', 'active', 'inactive'], default: 'all' })
  @IsOptional() @IsIn(['all', 'active', 'inactive']) status?: 'all' | 'active' | 'inactive';
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Type(() => Number) page?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(100) @Type(() => Number) limit?: number;
}

export class SubmitSimRequestDto {
  @ApiProperty() @IsInt() @Min(1) quantity!: number;
  @ApiProperty() @IsString() carrier!: string;
  @ApiProperty() @IsString() planType!: string;
  @ApiProperty() @IsString() dataBundlePlanId!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() useCase?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() deviceMappingFileId?: string;
}

export class CreateCarrierDto {
  @ApiProperty() @IsString() @MinLength(1) id!: string;
  @ApiProperty() @IsString() @MinLength(1) name!: string;
  @ApiProperty() @IsString() @MinLength(1) displayName!: string;
}

export class UpdateCarrierDto {
  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() displayName?: string;
  @ApiPropertyOptional() @IsOptional() active?: boolean;
}

export class CreateBundleDto {
  @ApiProperty() @IsString() @MinLength(1) id!: string;
  @ApiProperty() @IsString() @MinLength(1) code!: string;
  @ApiProperty() @IsString() @MinLength(1) name!: string;
  @ApiProperty() @IsString() carrierId!: string;
  @ApiProperty() @IsNumber() @Min(0) dataAmountGb!: number;
  @ApiProperty() @IsInt() @Min(1) validityDays!: number;
  @ApiProperty() @IsString() billingCycle!: string;
  @ApiProperty() @IsNumber() @Min(0) priceNaira!: number;
  @ApiPropertyOptional() @IsOptional() @IsString() currency?: string;
}

export class UpdateBundleDto {
  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) dataAmountGb?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) validityDays?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() billingCycle?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) priceNaira?: number;
  @ApiPropertyOptional() @IsOptional() active?: boolean;
}
