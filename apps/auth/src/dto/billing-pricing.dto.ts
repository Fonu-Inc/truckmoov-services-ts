import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { StandardApiResponse } from '@shared/openapi';

const PRICE_ITEM_TYPES = ['m2m_plan', 'installation_fee'] as const;

export class CreateLicensePlanDto {
  @ApiProperty({ description: 'Unique, lowercase letters, digits and underscores.' })
  @IsString() @Matches(/^[a-z][a-z0-9_]{1,63}$/) code!: string;
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(120) name!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(255) description?: string;
  @ApiProperty({ description: 'Whole naira per device in the first year.' })
  @IsInt() @Min(1) perDeviceYear1Ngn!: number;
  @ApiProperty({ description: 'Whole naira per device at renewal.' })
  @IsInt() @Min(1) perDeviceRenewalNgn!: number;
  @ApiPropertyOptional({ default: 365 }) @IsOptional() @IsInt() @Min(1) validityDays?: number;
  @ApiPropertyOptional({ type: [String] })
  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) @MaxLength(120, { each: true }) components?: string[];
  @ApiPropertyOptional({ default: true }) @IsOptional() @IsBoolean() isActive?: boolean;
}

export class UpdateLicensePlanDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MinLength(1) @MaxLength(120) name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(255) description?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) validityDays?: number;
  @ApiPropertyOptional({ type: [String] })
  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) @MaxLength(120, { each: true }) components?: string[];
  @ApiPropertyOptional({ description: 'Whole naira. A change needs a reason.' })
  @IsOptional() @IsInt() @Min(1) perDeviceYear1Ngn?: number;
  @ApiPropertyOptional({ description: 'Whole naira. A change needs a reason.' })
  @IsOptional() @IsInt() @Min(1) perDeviceRenewalNgn?: number;
  @ApiPropertyOptional({ description: 'Required when a price changes.' })
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
  @ApiPropertyOptional({ description: 'YYYY-MM-DD, Africa/Lagos, not in the future. Defaults to today.' })
  @IsOptional() @IsString() effectiveDate?: string;
}

export class ListLicensePlansQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() q?: string;
  @ApiPropertyOptional({ enum: ['all', 'active', 'inactive'], default: 'all' })
  @IsOptional() @IsIn(['all', 'active', 'inactive']) status?: 'all' | 'active' | 'inactive';
  @ApiPropertyOptional({ default: 1 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @ApiPropertyOptional({ default: 20, maximum: 100 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number;
}

export class ListPriceHistoryQueryDto {
  @ApiPropertyOptional({ enum: PRICE_ITEM_TYPES })
  @IsOptional() @IsIn(PRICE_ITEM_TYPES) itemType?: (typeof PRICE_ITEM_TYPES)[number];
  @ApiPropertyOptional({ description: 'Plan code, or installation_fee.' })
  @IsOptional() @IsString() itemRef?: string;
  @ApiPropertyOptional({ default: 1 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @ApiPropertyOptional({ default: 20, maximum: 100 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number;
}

export class UpdateInstallationPriceDto {
  @ApiProperty({ description: 'Whole naira per device for fleet providers, enterprises and aggregators.' })
  @IsInt() @Min(1) enterpriseNgn!: number;
  @ApiProperty({ description: 'Whole naira per device for owner operators.' })
  @IsInt() @Min(1) ownerOperatorNgn!: number;
  @ApiPropertyOptional({ description: 'Required when a price changes.' })
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
  @ApiPropertyOptional({ description: 'YYYY-MM-DD, Africa/Lagos, not in the future. Defaults to today.' })
  @IsOptional() @IsString() effectiveDate?: string;
}

export class LicensePlanViewSchema {
  @ApiProperty() code!: string;
  @ApiProperty() name!: string;
  @ApiProperty() description!: string;
  @ApiProperty() perDeviceYear1Ngn!: number;
  @ApiProperty() perDeviceRenewalNgn!: number;
  @ApiProperty() validityDays!: number;
  @ApiProperty({ type: [String] }) components!: string[];
  @ApiProperty() isActive!: boolean;
  @ApiProperty() sortOrder!: number;
  @ApiProperty({ type: String, nullable: true }) lastPriceChangedAt!: string | null;
  @ApiProperty() createdAt!: string;
  @ApiProperty() updatedAt!: string;
}

export class PriceChangeViewSchema {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: PRICE_ITEM_TYPES }) itemType!: string;
  @ApiProperty() itemRef!: string;
  @ApiProperty({ enum: ['year1', 'renewal', 'enterprise', 'owner_operator'] }) field!: string;
  @ApiProperty() oldPriceNgn!: number;
  @ApiProperty() newPriceNgn!: number;
  @ApiProperty({ description: 'YYYY-MM-DD' }) effectiveDate!: string;
  @ApiProperty() reason!: string;
  @ApiProperty() changedByUserId!: string;
  @ApiProperty() changedByName!: string;
  @ApiProperty() createdAt!: string;
}

export class LicensePlansPageSchema {
  @ApiProperty({ type: [LicensePlanViewSchema] }) items!: LicensePlanViewSchema[];
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() limit!: number;
}

export class LicensePlansPageResponse extends StandardApiResponse<LicensePlansPageSchema> {
  @ApiProperty({ type: LicensePlansPageSchema }) data!: LicensePlansPageSchema;
}

export class LicensePlanDetailSchema {
  @ApiProperty({ type: LicensePlanViewSchema }) plan!: LicensePlanViewSchema;
  @ApiProperty({ type: [PriceChangeViewSchema] }) priceHistory!: PriceChangeViewSchema[];
}

export class LicensePlanDetailResponse extends StandardApiResponse<LicensePlanDetailSchema> {
  @ApiProperty({ type: LicensePlanDetailSchema }) data!: LicensePlanDetailSchema;
}

export class LicensePlanActionSchema {
  @ApiProperty({ type: LicensePlanViewSchema }) plan!: LicensePlanViewSchema;
}

export class LicensePlanActionResponse extends StandardApiResponse<LicensePlanActionSchema> {
  @ApiProperty({ type: LicensePlanActionSchema }) data!: LicensePlanActionSchema;
}

export class LicensePlanUpdateSchema {
  @ApiProperty({ type: LicensePlanViewSchema }) plan!: LicensePlanViewSchema;
  @ApiProperty({ type: [PriceChangeViewSchema] }) priceChanges!: PriceChangeViewSchema[];
}

export class LicensePlanUpdateResponse extends StandardApiResponse<LicensePlanUpdateSchema> {
  @ApiProperty({ type: LicensePlanUpdateSchema }) data!: LicensePlanUpdateSchema;
}

export class PriceChangesPageSchema {
  @ApiProperty({ type: [PriceChangeViewSchema] }) items!: PriceChangeViewSchema[];
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() limit!: number;
}

export class PriceChangesPageResponse extends StandardApiResponse<PriceChangesPageSchema> {
  @ApiProperty({ type: PriceChangesPageSchema }) data!: PriceChangesPageSchema;
}

export class InstallationPriceSchema {
  @ApiProperty() enterpriseNgn!: number;
  @ApiProperty() ownerOperatorNgn!: number;
  @ApiProperty({ type: String, nullable: true }) lastChangedAt!: string | null;
  @ApiProperty({ type: [PriceChangeViewSchema] }) priceHistory!: PriceChangeViewSchema[];
}

export class InstallationPriceResponse extends StandardApiResponse<InstallationPriceSchema> {
  @ApiProperty({ type: InstallationPriceSchema }) data!: InstallationPriceSchema;
}
