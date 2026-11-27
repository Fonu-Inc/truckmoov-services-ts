import { ApiProperty, ApiPropertyOptional, PartialType } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { ArrayMinSize, IsArray, IsBoolean, IsIn, IsNumber, IsOptional, IsString, Max, MaxLength, Min, MinLength, ValidateNested } from "class-validator";
import type { GeofenceZoneStatus } from "../geofence-zone.repository";

const GEOFENCE_STATUSES: GeofenceZoneStatus[] = ["ACTIVE", "ARCHIVED"];
const GEOFENCE_SHAPES = ["CIRCLE", "POLYGON"] as const;

class GeofenceCenterDto {
  @ApiProperty({ minimum: -90, maximum: 90 })
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude!: number;

  @ApiProperty({ minimum: -180, maximum: 180 })
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude!: number;
}

class GeofenceSpeedLimitDto {
  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsNumber()
  limitKph?: number | null;
}

class GeofenceScheduleDto {
  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({ nullable: true, default: "Africa/Lagos" })
  @IsOptional()
  @IsString()
  timezone?: string | null;

  @ApiPropertyOptional({ type: String, isArray: true })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  days?: string[];

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  startTime?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  endTime?: string | null;
}

export class CreateGeofenceZoneDto {
  @ApiProperty({ description: "Zone name" })
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  description?: string | null;

  @ApiPropertyOptional({ description: "Zone type, e.g. \"RESTRICTED_AREA\", \"CUSTOMER_SITE\"", default: "general" })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  zoneType?: string;

  @ApiPropertyOptional({ enum: GEOFENCE_SHAPES, description: "Derived from radiusMeters/center vs coordinates when omitted" })
  @IsOptional()
  @IsIn(GEOFENCE_SHAPES)
  shape?: (typeof GEOFENCE_SHAPES)[number];

  @ApiPropertyOptional({ type: GeofenceCenterDto, nullable: true, description: "Circle center; required when shape is CIRCLE" })
  @IsOptional()
  @ValidateNested()
  @Type(() => GeofenceCenterDto)
  center?: GeofenceCenterDto | null;

  @ApiProperty({
    description: "Polygon vertices as [lng, lat] pairs (empty for circle zones)",
    type: "array",
    items: { type: "array", items: { type: "number" }, minItems: 2, maxItems: 2 },
  })
  @IsArray()
  coordinates!: [number, number][];

  @ApiPropertyOptional({ nullable: true, description: "Radius in metres for circular zones" })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  radiusMeters?: number | null;

  @ApiPropertyOptional({ description: "Zone category, e.g. \"Restricted Area\"", default: "general" })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  category?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  entryAlertsEnabled?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  exitAlertsEnabled?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  dwellAlertsEnabled?: boolean;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsNumber()
  dwellMinutes?: number | null;

  @ApiPropertyOptional({ type: GeofenceSpeedLimitDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => GeofenceSpeedLimitDto)
  speedLimit?: GeofenceSpeedLimitDto;

  @ApiPropertyOptional({ type: GeofenceScheduleDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => GeofenceScheduleDto)
  schedule?: GeofenceScheduleDto;

  @ApiPropertyOptional({ type: String, isArray: true, description: "Vehicle IDs assigned to the zone" })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  assignedVehicleIds?: string[];
}

export class UpdateGeofenceZoneDto extends PartialType(CreateGeofenceZoneDto) {
  @ApiPropertyOptional({ enum: GEOFENCE_STATUSES })
  @IsOptional()
  @IsIn(GEOFENCE_STATUSES)
  status?: GeofenceZoneStatus;
}

export class SetGeofenceVehiclesDto {
  @ApiProperty({ type: String, isArray: true, description: "Vehicle IDs assigned to the zone" })
  @IsArray()
  @IsString({ each: true })
  vehicleIds!: string[];
}
