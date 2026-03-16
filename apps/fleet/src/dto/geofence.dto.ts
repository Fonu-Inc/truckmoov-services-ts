import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsNumber, ValidateNested } from "class-validator";

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
