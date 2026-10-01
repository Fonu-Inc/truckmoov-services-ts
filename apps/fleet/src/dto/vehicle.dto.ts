import { ApiPropertyOptional, OmitType, PartialType } from "@nestjs/swagger";
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
import {
  DEVICE_LIFECYCLE_STATUSES,
} from "../contexts/fleet/devices/domain/entities/device.entity";
import { DEVICE_STATUS_FILTERS } from "../contexts/fleet/devices/domain/device-inventory";
import { FLEET_ASSET_STATUSES } from "../contexts/fleet/shared/domain/fleet-status";
import { DRIVER_STATUS_INPUTS } from "../contexts/fleet/drivers/domain/entities/driver.entity";
import { FLEET_FUEL_TYPES } from "../contexts/fleet/vehicles/domain/entities/vehicle.entity";
import { VEHICLE_CAPACITY_UNITS } from "../contexts/fleet/vehicles/domain/vehicle-capacity";

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

  @IsOptional()
  @IsIn(FLEET_FUEL_TYPES)
  fuelType?: typeof FLEET_FUEL_TYPES[number];

  /** Carrying capacity, expressed in capacityUnit. Range is checked per unit. */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  capacity?: number;

  /**
   * Unit the capacity is given in. Defaults to tons. Only checked for being text
   * here: the domain checks the unit itself and answers an unknown one with a 400
   * naming the field, which the form binds to the Unit input.
   */
  @IsOptional()
  @IsString()
  @ApiPropertyOptional({ enum: [...VEHICLE_CAPACITY_UNITS] })
  capacityUnit?: (typeof VEHICLE_CAPACITY_UNITS)[number];

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
}

export class CreateDeviceDto {
  @IsString()
  @MinLength(15)
  @MaxLength(15)
  @Matches(/^\d+$/)
  imei!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsString()
  @MaxLength(50)
  manufacturer!: string;

  @IsString()
  @MaxLength(50)
  model!: string;

  @IsString()
  @MaxLength(20)
  firmwareVersion!: string;

  @IsOptional()
  @IsIn(DEVICE_LIFECYCLE_STATUSES)
  lifecycleStatus?: typeof DEVICE_LIFECYCLE_STATUSES[number];
}

export class UpdateDeviceDto extends PartialType(OmitType(CreateDeviceDto, ["imei"] as const)) {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  signalStrength?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  batteryLevel?: number | null;

  @IsOptional()
  @IsISO8601()
  lastSeen?: string | null;
}

export class SetDeviceLifecycleStatusDto {
  @IsIn(DEVICE_LIFECYCLE_STATUSES)
  lifecycleStatus!: typeof DEVICE_LIFECYCLE_STATUSES[number];
}

const LAST_SEEN_BUCKETS = ["5min", "1hr", "24hr", "7day", "never"] as const;

export class SetDeviceFirmwareDto {
  @IsString()
  @MaxLength(20)
  firmwareVersion!: string;
}

export class AssignDeviceToVehicleDto {
  @IsString()
  vehicleId!: string;
}

export class DeviceAssignmentValidationQueryDto {
  @IsString()
  vehicleId!: string;
}

export class SuspendDeviceDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class DeviceListQueryDto {
  @IsOptional()
  @IsString()
  query?: string;

  @IsOptional()
  @IsString()
  manufacturer?: string;

  @IsOptional()
  @IsIn(DEVICE_STATUS_FILTERS)
  status?: typeof DEVICE_STATUS_FILTERS[number];

  @IsOptional()
  @IsIn(DEVICE_LIFECYCLE_STATUSES)
  lifecycleStatus?: typeof DEVICE_LIFECYCLE_STATUSES[number];

  @IsOptional()
  @IsString()
  assigned?: string;

  @IsOptional()
  @IsIn(LAST_SEEN_BUCKETS)
  lastSeenBucket?: typeof LAST_SEEN_BUCKETS[number];
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
  @IsIn(FLEET_FUEL_TYPES)
  fuelType?: typeof FLEET_FUEL_TYPES[number];

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  capacity?: number;

  @IsOptional()
  @IsIn(FLEET_ASSET_STATUSES)
  status?: "active" | "inactive";
}

export class BulkImportVehiclesDto {

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
  status?: "active" | "inactive" | "maintenance" | "decommissioned";

  @IsOptional()
  @IsString()
  assigned?: string;

  @IsOptional()
  @IsIn(["truck", "van", "trailer"])
  type?: string;

  @IsOptional()
  @IsString()
  yearFrom?: string;

  @IsOptional()
  @IsString()
  yearTo?: string;
}

export class RecommendDriversQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  requiredCapacity?: number;

  @IsOptional()
  @IsIn(FLEET_VEHICLE_TYPES)
  vehicleType?: "truck" | "van" | "trailer";

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  pickupLat?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  pickupLng?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

export class RecommendVehiclesQueryDto {
  @ApiPropertyOptional({ description: "Cargo weight in kg the vehicle must carry" })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  requiredWeightKg?: number;

  @ApiPropertyOptional({ enum: FLEET_VEHICLE_TYPES })
  @IsOptional()
  @IsIn(FLEET_VEHICLE_TYPES)
  vehicleType?: "truck" | "van" | "trailer";

  @ApiPropertyOptional({ enum: FLEET_FUEL_TYPES })
  @IsOptional()
  @IsIn(FLEET_FUEL_TYPES)
  fuelType?: (typeof FLEET_FUEL_TYPES)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  pickupLat?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  pickupLng?: number;

  @ApiPropertyOptional({ description: "Default 10, at most 50" })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
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
}
