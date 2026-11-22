import { ApiProperty, ApiPropertyOptional, PartialType } from "@nestjs/swagger";
import { ArrayMaxSize, IsArray, IsBoolean, IsOptional, IsString, MaxLength } from "class-validator";
import { StandardApiResponse } from "@shared/openapi";

export class CreateFleetGroupDto {
  @ApiProperty({ example: "Lagos Mainland Fleet", maxLength: 80 })
  @IsString()
  @MaxLength(80)
  name!: string;

  @ApiPropertyOptional({ maxLength: 240, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(240)
  description?: string | null;

  @ApiPropertyOptional({ type: String, isArray: true, description: "The tenant's vehicle ids in this fleet" })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5000)
  @IsString({ each: true })
  vehicleIds?: string[];

  @ApiPropertyOptional({ default: false, description: "Track and report violations for this fleet's vehicles" })
  @IsOptional()
  @IsBoolean()
  violationsEnabled?: boolean;
}

export class UpdateFleetGroupDto extends PartialType(CreateFleetGroupDto) {}

export class FleetGroupSchema {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ type: String, nullable: true }) description!: string | null;
  @ApiProperty() violationsEnabled!: boolean;
  @ApiProperty({ type: String, isArray: true }) vehicleIds!: string[];
  @ApiProperty() vehicleCount!: number;
  @ApiProperty() createdAt!: string;
  @ApiProperty() updatedAt!: string;
}

export class FleetGroupResponse extends StandardApiResponse<FleetGroupSchema> {
  @ApiProperty({ type: FleetGroupSchema }) data!: FleetGroupSchema;
}

export class FleetGroupListResponse extends StandardApiResponse<FleetGroupSchema[]> {
  @ApiProperty({ type: [FleetGroupSchema] }) data!: FleetGroupSchema[];
}
