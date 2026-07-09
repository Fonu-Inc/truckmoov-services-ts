import { ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsBoolean, IsISO8601, IsIn, IsInt, IsNumber, IsOptional, IsString, Min } from "class-validator";

const STATEMENT_FORMATS = ["pdf", "csv", "xlsx"] as const;
const DRIVER_WAGE_ALLOCATION_METHODS = ["fixed_monthly", "per_trip", "per_kilometer", "hybrid"] as const;
const DEPRECIATION_METHODS = ["straight_line", "declining_balance"] as const;

export class ComputeProfitabilityDto {
  @ApiPropertyOptional({ description: "Number of months to aggregate over (defaults to 1)", default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  periodMonths?: number;

  @ApiPropertyOptional({ description: "Start of date range (ISO8601)" })
  @IsOptional()
  @IsISO8601()
  from?: string;

  @ApiPropertyOptional({ description: "End of date range (ISO8601)" })
  @IsOptional()
  @IsISO8601()
  to?: string;

  @ApiPropertyOptional({ description: "Search by plate number" })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  marginFrom?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  marginTo?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  revenueFrom?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  revenueTo?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  netProfitFrom?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  netProfitTo?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  scoreFrom?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  scoreTo?: number;
}

export class FinancialSummaryQueryDto {
  @ApiPropertyOptional({ description: "Number of months to aggregate over (defaults to 1)", default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  periodMonths?: number;

  @ApiPropertyOptional({ description: "Start of date range (ISO8601)" })
  @IsOptional()
  @IsISO8601()
  from?: string;

  @ApiPropertyOptional({ description: "End of date range (ISO8601)" })
  @IsOptional()
  @IsISO8601()
  to?: string;
}

export class StatementQueryDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  periodMonths?: number;

  @ApiPropertyOptional({ description: "Statement title" })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({ description: "Company name shown on cover page" })
  @IsOptional()
  @IsString()
  companyName?: string;

  @ApiPropertyOptional({ description: "Prepared by" })
  @IsOptional()
  @IsString()
  preparedBy?: string;

  @ApiPropertyOptional({ description: "Notes / disclaimer printed at the end" })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ description: "Accent color name/hex" })
  @IsOptional()
  @IsString()
  accentColor?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  includeCoverPage?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  includeFleetSummary?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  includePerVehicleBreakdown?: boolean;
}

export class StatementExportQueryDto extends StatementQueryDto {
  @ApiPropertyOptional({ enum: STATEMENT_FORMATS, default: "pdf" })
  @IsOptional()
  @IsIn(STATEMENT_FORMATS)
  format?: typeof STATEMENT_FORMATS[number];
}

export class UpsertFinancialConfigDto {
  @ApiPropertyOptional({ nullable: true, description: "Monthly driver wages (NGN)" })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  monthlyWagesNgn?: number | null;

  @ApiPropertyOptional({ nullable: true, description: "Monthly insurance cost (NGN)" })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  monthlyInsuranceNgn?: number | null;

  @ApiPropertyOptional({ nullable: true, description: "Monthly depreciation (NGN)" })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  monthlyDepreciationNgn?: number | null;

  @ApiPropertyOptional({ nullable: true, description: "Other monthly fixed costs (NGN)" })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  monthlyOtherNgn?: number | null;

  @ApiPropertyOptional({
    nullable: true,
    description: "Estimated monthly fuel cost (NGN), used only when no fuel records exist for the period",
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  fuelEstimateNgnPerMonth?: number | null;

  @ApiPropertyOptional({
    nullable: true,
    description: "Estimated monthly maintenance cost (NGN), used only when no maintenance records exist for the period",
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maintenanceEstimateNgnPerMonth?: number | null;

  @ApiPropertyOptional({ enum: DRIVER_WAGE_ALLOCATION_METHODS, nullable: true, description: "How the driver wage is allocated" })
  @IsOptional()
  @IsIn(DRIVER_WAGE_ALLOCATION_METHODS)
  driverWageAllocationMethod?: (typeof DRIVER_WAGE_ALLOCATION_METHODS)[number] | null;

  @ApiPropertyOptional({ nullable: true, description: "Monthly driver wage (NGN)" })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  monthlyDriverWageNgn?: number | null;

  @ApiPropertyOptional({ nullable: true, description: "Asset purchase price (NGN)" })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  assetPurchasePriceNgn?: number | null;

  @ApiPropertyOptional({ nullable: true, description: "Asset purchase date (ISO8601)" })
  @IsOptional()
  @IsISO8601()
  assetPurchaseDate?: string | null;

  @ApiPropertyOptional({ nullable: true, description: "Asset useful life in months" })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  assetUsefulLifeMonths?: number | null;

  @ApiPropertyOptional({ nullable: true, description: "Asset salvage value (NGN)" })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  assetSalvageValueNgn?: number | null;

  @ApiPropertyOptional({ enum: DEPRECIATION_METHODS, nullable: true, description: "Depreciation method applied to the asset" })
  @IsOptional()
  @IsIn(DEPRECIATION_METHODS)
  depreciationMethod?: (typeof DEPRECIATION_METHODS)[number] | null;
}
