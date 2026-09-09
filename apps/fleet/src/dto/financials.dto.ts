import { ApiPropertyOptional } from "@nestjs/swagger";
import { Transform, Type } from "class-transformer";
import { IsBoolean, IsISO8601, IsIn, IsInt, IsNumber, IsOptional, IsString, Min } from "class-validator";

/**
 * A query string carries "false", and `Boolean("false")` is true, so the
 * built-in Boolean transform turns every toggle on regardless of what was sent.
 */
const toBoolean = () =>
  Transform(({ value }) => {
    if (typeof value === "boolean" || value === undefined) return value;
    const text = String(value).trim().toLowerCase();
    if (["false", "0", "no"].includes(text)) return false;
    if (["true", "1", "yes"].includes(text)) return true;
    return value;
  });

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
  @toBoolean()
  @IsBoolean()
  includeCoverPage?: boolean;

  @ApiPropertyOptional({ default: true, description: "Fleet totals section" })
  @IsOptional()
  @toBoolean()
  @IsBoolean()
  includeSummary?: boolean;

  @ApiPropertyOptional({ default: true, description: "Per-vehicle profit and loss table" })
  @IsOptional()
  @toBoolean()
  @IsBoolean()
  includeVehiclePL?: boolean;

  @ApiPropertyOptional({ default: true, description: "Per-vehicle cost category table" })
  @IsOptional()
  @toBoolean()
  @IsBoolean()
  includeCostBreakdown?: boolean;

  @ApiPropertyOptional({ deprecated: true, description: "Former name for includeSummary" })
  @IsOptional()
  @toBoolean()
  @IsBoolean()
  includeFleetSummary?: boolean;

  @ApiPropertyOptional({ deprecated: true, description: "Former name for includeVehiclePL" })
  @IsOptional()
  @toBoolean()
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

  @ApiPropertyOptional({ nullable: true, description: "Monthly parking fixed cost (NGN)" })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  monthlyParkingNgn?: number | null;

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

  /* The names the Configure Costs form posts. Kept alongside the stored names
     so neither spelling is rejected. */

  @ApiPropertyOptional({ nullable: true, description: "Alias of monthlyOtherNgn" })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  fixedCostMonthly?: number | null;

  @ApiPropertyOptional({ nullable: true, description: "Alias of monthlyDriverWageNgn" })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  driverWageMonthly?: number | null;

  @ApiPropertyOptional({ enum: DRIVER_WAGE_ALLOCATION_METHODS, nullable: true, description: "Alias of driverWageAllocationMethod" })
  @IsOptional()
  @IsIn(DRIVER_WAGE_ALLOCATION_METHODS)
  wageAllocationMethod?: (typeof DRIVER_WAGE_ALLOCATION_METHODS)[number] | null;

  @ApiPropertyOptional({ nullable: true, description: "Alias of assetUsefulLifeMonths" })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  depreciationLifetimeMonths?: number | null;

  @ApiPropertyOptional({ nullable: true, description: "Alias of assetPurchasePriceNgn" })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  vehicleCostNgn?: number | null;

  @ApiPropertyOptional({ nullable: true, description: "Alias of assetSalvageValueNgn" })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  salvageValueNgn?: number | null;
}

/** Alias name posted by the form -> the column it is stored in. */
const CONFIG_ALIASES: Record<string, string> = {
  fixedCostMonthly: "monthlyOtherNgn",
  driverWageMonthly: "monthlyDriverWageNgn",
  wageAllocationMethod: "driverWageAllocationMethod",
  depreciationLifetimeMonths: "assetUsefulLifeMonths",
  vehicleCostNgn: "assetPurchasePriceNgn",
  salvageValueNgn: "assetSalvageValueNgn",
};

/**
 * Folds the alias spellings onto the stored column names. A canonical name
 * present in the same body wins, so a client sending both cannot be surprised
 * by which one landed.
 */
export function normalizeFinancialConfig(dto: UpsertFinancialConfigDto): Record<string, unknown> {
  const source = dto as unknown as Record<string, unknown>;
  const out: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(source)) {
    if (value === undefined || key in CONFIG_ALIASES) continue;
    out[key] = value;
  }
  for (const [alias, column] of Object.entries(CONFIG_ALIASES)) {
    if (source[alias] !== undefined && out[column] === undefined) out[column] = source[alias];
  }
  return out;
}

/** Maps the deprecated statement toggle names onto the current ones. */
export function normalizeStatementOptions(query: StatementQueryDto) {
  return {
    title: query.title,
    companyName: query.companyName,
    preparedBy: query.preparedBy,
    notes: query.notes,
    accentColor: query.accentColor,
    includeCoverPage: query.includeCoverPage,
    includeSummary: query.includeSummary ?? query.includeFleetSummary,
    includeVehiclePL: query.includeVehiclePL ?? query.includePerVehicleBreakdown,
    includeCostBreakdown: query.includeCostBreakdown,
  };
}
