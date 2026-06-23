import { ApiProperty, ApiPropertyOptional, PartialType } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { ArrayMinSize, IsArray, IsIn, IsNumber, IsOptional, IsString, MinLength, ValidateNested } from "class-validator";
import type { GeofenceZoneStatus } from "../geofence-zone.repository";

const GEOFENCE_STATUSES: GeofenceZoneStatus[] = ["ACTIVE", "ARCHIVED"];

class LatLngDto {
  @ApiProperty({ description: "Latitude in decimal degrees" })
  @IsNumber()
  lat!: number;

  @ApiProperty({ description: "Longitude in decimal degrees" })
  @IsNumber()
  lng!: number;
}

export class SetGeofenceDto {
  @ApiProperty({ type: LatLngDto })
  @ValidateNested()
  @Type(() => LatLngDto)
  northeast!: LatLngDto;

  @ApiProperty({ type: LatLngDto })
  @ValidateNested()
  @Type(() => LatLngDto)
  southwest!: LatLngDto;
}

export class LocationUpdateDto {
  @ApiProperty({ description: "Decimal latitude" })
  @IsNumber()
  lat!: number;

  @ApiProperty({ description: "Decimal longitude" })
  @IsNumber()
  lng!: number;
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

  @ApiProperty({
    description: "Polygon vertices as [lng, lat] pairs",
    type: "array",
    items: { type: "array", items: { type: "number" }, minItems: 2, maxItems: 2 },
  })
  @IsArray()
  @ArrayMinSize(1)
  coordinates!: [number, number][];

  @ApiPropertyOptional({ nullable: true, description: "Radius in metres for circular zones" })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  radiusMeters?: number | null;
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
