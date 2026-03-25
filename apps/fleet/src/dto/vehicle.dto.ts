import { PartialType } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsArray,
  IsIn,
  IsISO8601,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";
import { FLEET_ASSET_STATUSES } from "../contexts/fleet/shared/domain/fleet-status";
import { DRIVER_STATUS_INPUTS } from "../contexts/fleet/drivers/domain/entities/driver.entity";

const FLEET_VEHICLE_TYPES = ["truck", "van", "trailer"] as const;

export class CreateVehicleDto {
  /** Legacy vehicle identifier accepted for backward compatibility */
  @IsOptional()
  @IsString()
  plateNumber?: string;

  /** Registration number shown in the UI */
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(20)
  registrationNumber?: string;

  /** Vehicle identification number */
  @IsOptional()
  @IsString()
  @MinLength(17)
  @MaxLength(17)
  vin?: string;

  /** OEM or manufacturer */
  @IsOptional()
  @IsString()
  @MaxLength(50)
  make?: string;

  /** Vehicle model */
  @IsString()
  model!: string;

  /** Vehicle year of manufacture */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1990)
  @Max(new Date().getFullYear() + 1)
  year?: number;

  /** Vehicle body type */
  @IsOptional()
  @IsIn(FLEET_VEHICLE_TYPES)
  type?: "truck" | "van" | "trailer";

  /** Vehicle carrying capacity in tons */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  capacity?: number;

  /** Tenant scope; defaults to DEFAULT_TENANT env */
  @IsOptional()
  @IsString()
  tenantId?: string;

  /** Operational availability status */
  @IsOptional()
  @IsIn(FLEET_ASSET_STATUSES)
  status?: "active" | "inactive";
}

export class UpdateVehicleDto extends PartialType(CreateVehicleDto) {}

export class SetVehicleStatusDto {
  @IsIn(FLEET_ASSET_STATUSES)
  status!: "active" | "inactive";
}

export class AssignDriverToVehicleDto {
  @IsString()
  driverId!: string;
}

export class RegisterGpsDeviceDto {
  /** Device IMEI shown in the fleet admin UI */
  @IsString()
  @MinLength(15)
  @MaxLength(15)
  @Matches(/^\d+$/)
  imei!: string;

  /** OEM / device manufacturer */
  @IsString()
  @MaxLength(50)
  manufacturer!: string;

  /** Device model */
  @IsString()
  @MaxLength(50)
  model!: string;

  /** Current firmware version */
  @IsString()
  @MaxLength(20)
  firmwareVersion!: string;

  /** Optional install timestamp for back-office tools */
  @IsOptional()
  @IsISO8601()
  installedAt?: string;
}

export class GpsDeviceListQueryDto {
  @IsOptional()
  @IsString()
  query?: string;

  @IsOptional()
  @IsIn(FLEET_ASSET_STATUSES)
  vehicleStatus?: "active" | "inactive";

  @IsOptional()
  @IsString()
  tenantId?: string;
}

export class VehicleImportItemDto {
  @IsOptional()
  @IsString()
  plateNumber?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(20)
  registrationNumber?: string;

  @IsOptional()
  @IsString()
  @MinLength(17)
  @MaxLength(17)
  vin?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  make?: string;

  @IsString()
  model!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1990)
  @Max(new Date().getFullYear() + 1)
  year?: number;

  @IsOptional()
  @IsIn(FLEET_VEHICLE_TYPES)
  type?: "truck" | "van" | "trailer";

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  capacity?: number;

  @IsOptional()
  @IsString()
  tenantId?: string;

  @IsOptional()
  @IsIn(FLEET_ASSET_STATUSES)
  status?: "active" | "inactive";
}

export class BulkImportVehiclesDto {
  @IsOptional()
  @IsString()
  tenantId?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => VehicleImportItemDto)
  items!: VehicleImportItemDto[];
}

export class VehicleListQueryDto {
  @IsOptional()
  @IsString()
  query?: string;

  @IsOptional()
  @IsIn(FLEET_ASSET_STATUSES)
  status?: "active" | "inactive";

  @IsOptional()
  @IsString()
  assigned?: string;

  @IsOptional()
  @IsString()
  tenantId?: string;
}

export class DispatchSearchQueryDto {
  @IsOptional()
  @IsString()
  query?: string;

  @IsOptional()
  @IsIn(FLEET_ASSET_STATUSES)
  vehicleStatus?: "active" | "inactive";

  @IsOptional()
  @IsIn(DRIVER_STATUS_INPUTS)
  driverStatus?: "active" | "available" | "offline" | "suspended" | "inactive";

  @IsOptional()
  @IsString()
  jobStatus?: string;

  @IsOptional()
  @IsString()
  assignedOnly?: string;

  @IsOptional()
  @IsString()
  tenantId?: string;
}
