import { PartialType } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsIn,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";
import {
  MAINTENANCE_RECORD_PRIORITIES,
  MAINTENANCE_RECORD_STATUSES,
  type MaintenanceRecordPriority,
  type MaintenanceRecordStatus,
} from "../maintenance-record.repository";

export class CreateMaintenanceRecordDto {
  /** Vehicle the record belongs to */
  @IsString()
  @MinLength(1)
  vehicleId!: string;

  /** Type of maintenance performed or scheduled */
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  maintenanceType!: string;

  /** Free-text description */
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string | null;

  /** Lifecycle status */
  @IsIn(MAINTENANCE_RECORD_STATUSES)
  status!: MaintenanceRecordStatus;

  /** Urgency level */
  @IsIn(MAINTENANCE_RECORD_PRIORITIES)
  priority!: MaintenanceRecordPriority;

  /** ISO date the work is scheduled for */
  @IsOptional()
  @IsISO8601()
  scheduledDate?: string | null;

  /** ISO date the work was completed */
  @IsOptional()
  @IsISO8601()
  completedDate?: string | null;

  /** Cost amount */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  cost?: number | null;

  /** ISO currency code */
  @IsString()
  @MinLength(3)
  @MaxLength(3)
  currency!: string;

  /** Technician name */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  technician?: string | null;

  /** Internal notes */
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string | null;
}

export class UpdateMaintenanceRecordDto extends PartialType(CreateMaintenanceRecordDto) {}
