import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsIn, IsISO8601, IsNumber, IsOptional, IsString, MaxLength, Min, MinLength } from "class-validator";
import type { MaintenanceIntervalType, MaintenanceMileageSource } from "../maintenance-profile.repository";

const INTERVAL_TYPES: MaintenanceIntervalType[] = ["date", "mileage", "both", "months"];
const MILEAGE_SOURCES: MaintenanceMileageSource[] = ["telemetry", "manual"];

export class CreateMaintenanceProfileDto {
  @ApiProperty({ description: "Vehicle the profile belongs to" })
  @IsString()
  @MinLength(1)
  vehicleId!: string;

  @ApiProperty({ description: "Service category key" })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  serviceType!: string;

  @ApiProperty({ description: "Human-readable service label" })
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  serviceLabel!: string;

  @ApiProperty({ enum: INTERVAL_TYPES, description: "How the next-due date/mileage is derived" })
  @IsIn(INTERVAL_TYPES)
  intervalType!: MaintenanceIntervalType;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  intervalDays?: number | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  intervalMonths?: number | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  intervalKm?: number | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsISO8601()
  lastServiceDate?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  lastServiceMileage?: number | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  currentMileage?: number | null;

  @ApiProperty({ enum: MILEAGE_SOURCES, description: "Where current mileage comes from" })
  @IsIn(MILEAGE_SOURCES)
  mileageSource!: MaintenanceMileageSource;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsISO8601()
  nextDueDate?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  nextDueMileage?: number | null;
}
