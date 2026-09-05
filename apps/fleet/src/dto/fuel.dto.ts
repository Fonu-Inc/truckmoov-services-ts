import { PartialType } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsIn, IsISO8601, IsNumber, IsOptional, IsPositive, IsString, Min } from "class-validator";

const FUEL_BUDGET_PERIODS = ["daily", "weekly", "monthly"] as const;
const FUEL_TYPES = ["diesel", "petrol", "ev", "hybrid"] as const;

export class RecordFuelDto {
  /** Vehicle id. Optional when vehicleRegistration is supplied instead. */
  @IsOptional()
  @IsString()
  vehicleId?: string;

  /** Registration as typed in the Record Fueling modal, resolved to a vehicle. */
  @IsOptional()
  @IsString()
  vehicleRegistration?: string;

  @IsOptional()
  @IsString()
  driverId?: string | null;

  /** Driver name as typed in the modal, matched against the tenant's drivers. */
  @IsOptional()
  @IsString()
  driverName?: string | null;

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
  /** Free-text across vehicle registration, driver name and station. */
  @IsOptional()
  @IsString()
  query?: string;

  @IsOptional()
  @IsIn(FUEL_TYPES)
  fuelType?: typeof FUEL_TYPES[number];

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  litresFrom?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  litresTo?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  totalFrom?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  totalTo?: number;

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
  @IsIn(["daily", "weekly", "monthly"])
  period?: "daily" | "weekly" | "monthly";

  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;
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
