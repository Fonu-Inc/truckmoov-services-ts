import { PartialType } from "@nestjs/swagger";
import { IsIn, IsISO8601, IsNumber, IsOptional, IsPositive, IsString, Min } from "class-validator";

const FUEL_BUDGET_PERIODS = ["daily", "weekly", "monthly"] as const;
const FUEL_TYPES = ["diesel", "petrol", "ev", "hybrid"] as const;

export class RecordFuelDto {
  @IsString()
  vehicleId!: string;

  @IsOptional()
  @IsString()
  driverId?: string | null;

  @IsOptional()
  @IsString()
  vehicleType?: string | null;

  @IsOptional()
  @IsIn(FUEL_TYPES)
  fuelType?: typeof FUEL_TYPES[number] | null;

  @IsNumber()
  @IsPositive()
  liters!: number;

  @IsNumber()
  @Min(0)
  pricePerLiter!: number;

  @IsOptional()
  @IsString()
  station?: string | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  odometer?: number | null;
}

export class UpdateFuelRecordDto extends PartialType(RecordFuelDto) {}

export class FuelListQueryDto {

  @IsOptional()
  @IsString()
  vehicleId?: string;

  @IsOptional()
  @IsString()
  driverId?: string;

  @IsOptional()
  @IsString()
  station?: string;

  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;
}

export class FuelThresholdDto {
  @IsNumber()
  @IsPositive()
  minKmPerLiter!: number;
}

export class FuelMetricsQueryDto {
  @IsOptional()
  @IsIn(["weekly", "monthly"])
  period?: "weekly" | "monthly";
}

export class UpsertFuelBudgetDto {
  @IsIn(FUEL_BUDGET_PERIODS)
  periodType!: typeof FUEL_BUDGET_PERIODS[number];

  @IsNumber()
  @Min(0)
  amountNgn!: number;
}

export class BudgetVsActualQueryDto {
  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;
}
