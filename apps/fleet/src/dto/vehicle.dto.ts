import { Type } from "class-transformer";
import {
  IsArray,
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  ValidateNested,
} from "class-validator";
import { FLEET_ASSET_STATUSES } from "../contexts/fleet/shared/domain/fleet-status";

export class CreateVehicleDto {
  /** License plate number of the vehicle */
  @IsString()
  plateNumber!: string;

  /** Vehicle make and model */
  @IsString()
  model!: string;

  /** Tenant scope; defaults to DEFAULT_TENANT env */
  @IsOptional()
  @IsString()
  tenantId?: string;

  /** Operational availability status */
  @IsOptional()
  @IsIn(FLEET_ASSET_STATUSES)
  status?: "active" | "inactive";
}

export class UpdateVehicleDto {
  /** License plate number of the vehicle */
  @IsOptional()
  @IsString()
  plateNumber?: string;

  /** Vehicle make and model */
  @IsOptional()
  @IsString()
  model?: string;

  /** Tenant scope */
  @IsOptional()
  @IsString()
  tenantId?: string;

  /** Operational availability status */
  @IsOptional()
  @IsIn(FLEET_ASSET_STATUSES)
  status?: "active" | "inactive";
}

export class SetVehicleStatusDto {
  @IsIn(FLEET_ASSET_STATUSES)
  status!: "active" | "inactive";
}

export class AssignDriverToVehicleDto {
  @IsString()
  driverId!: string;
}

export class RegisterGpsDeviceDto {
  @IsString()
  deviceId!: string;

  @IsString()
  provider!: string;

  @IsString()
  serialNumber!: string;

  @IsOptional()
  @IsISO8601()
  installedAt?: string;
}

export class VehicleImportItemDto {
  @IsString()
  plateNumber!: string;

  @IsString()
  model!: string;

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
  @IsIn(FLEET_ASSET_STATUSES)
  driverStatus?: "active" | "inactive";

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
