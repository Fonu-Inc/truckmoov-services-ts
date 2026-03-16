import { PartialType } from "@nestjs/swagger";
import { IsIn, IsISO8601, IsNumber, IsOptional, IsPositive, IsString, Min } from "class-validator";

export class RecordFuelDto {
  @IsString()
  vehicleId!: string;

  @IsOptional()
  @IsString()
  driverId?: string | null;

  @IsOptional()
  @IsString()
  vehicleType?: string | null;

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

  @IsOptional()
  @IsString()
  tenantId?: string;
}

export class UpdateFuelRecordDto extends PartialType(RecordFuelDto) {}

export class FuelListQueryDto {
  @IsOptional()
  @IsString()
  tenantId?: string;

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

  @IsOptional()
  @IsString()
  tenantId?: string;
}
