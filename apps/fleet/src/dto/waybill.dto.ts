import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsISO8601,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from "class-validator";
import { PRICING_MODES } from "../contexts/fleet/waybills/domain/entities/pricing-rule.entity";

export class ReviewWaybillDto {
  @ApiPropertyOptional({ nullable: true, description: "Tenant-unique once set" })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  waybillNumber?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  origin?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  destination?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  vehicleRegistration?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  customerName?: string | null;

  @ApiPropertyOptional({ nullable: true, type: Number })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  weight?: number | null;

  @ApiPropertyOptional({
    nullable: true,
    description: "The unit the weight is in. Stated explicitly: a 28 in tonnes and a 28 in kilograms differ by a thousand.",
  })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  weightUnit?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description: "The date on the document. This is what prices it, not the day it was captured.",
  })
  @IsOptional()
  @IsISO8601()
  waybillDate?: string | null;
}

export class SavePricingRuleDto {
  @ApiProperty()
  @IsString()
  @MaxLength(255)
  name!: string;

  @ApiPropertyOptional({ nullable: true, description: "Empty matches any origin" })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  origin?: string | null;

  @ApiProperty()
  @IsString()
  @MaxLength(255)
  destination!: string;

  @ApiPropertyOptional({
    type: String,
    isArray: true,
    description: "Other spellings of the destination. Waybills are handwritten.",
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  destinationAliases?: string[];

  @ApiProperty({ enum: PRICING_MODES })
  @IsEnum(PRICING_MODES)
  mode!: (typeof PRICING_MODES)[number];

  @ApiPropertyOptional({ nullable: true, type: Number, description: "Naira" })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  flatPrice?: number | null;

  @ApiPropertyOptional({ nullable: true, type: Number, description: "Naira per unit" })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  pricePerUnit?: number | null;

  @ApiPropertyOptional({ nullable: true, description: "ton, bag, trip" })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  unitType?: string | null;

  @ApiPropertyOptional({ nullable: true, type: Number, description: "Naira" })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minimumCharge?: number | null;

  @ApiPropertyOptional({ nullable: true, description: "Empty matches any vehicle type" })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  vehicleType?: string | null;

  @ApiPropertyOptional({ nullable: true, description: "Empty applies to every customer" })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  customerName?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsISO8601()
  effectiveFrom?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsISO8601()
  effectiveTo?: string | null;
}

export class SaveInvoiceSettingsDto {
  @ApiProperty()
  @IsString()
  @MaxLength(255)
  companyName!: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  address?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsEmail()
  email?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  taxEnabled?: boolean;

  @ApiPropertyOptional({ nullable: true, type: Number, description: "Percent, e.g. 7.5" })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  taxRatePercent?: number | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  bankName?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  accountName?: string | null;

  @ApiPropertyOptional({ nullable: true, description: "10 digits" })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  accountNumber?: string | null;

  @ApiPropertyOptional({ nullable: true, description: "Changing this never renumbers issued invoices" })
  @IsOptional()
  @IsString()
  @MaxLength(16)
  invoicePrefix?: string | null;

  @ApiPropertyOptional({ nullable: true, type: Number })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  paymentTermsDays?: number | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  defaultNotes?: string | null;
}

export class GenerateInvoiceDto {
  @ApiProperty({ type: String, isArray: true })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  waybillIds!: string[];
}

export class SendInvoiceDto {
  @ApiPropertyOptional({
    nullable: true,
    description: "Defaults to the address the waybill arrived from.",
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  to?: string | null;
}

export class MarkInvoicePaidDto {
  @ApiProperty()
  @IsISO8601()
  paidAt!: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  reference?: string | null;
}
