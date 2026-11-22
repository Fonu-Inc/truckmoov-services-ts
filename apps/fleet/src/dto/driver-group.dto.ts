import { ApiProperty, ApiPropertyOptional, PartialType } from "@nestjs/swagger";
import { ArrayMaxSize, IsArray, IsBoolean, IsOptional, IsString, MaxLength } from "class-validator";
import { StandardApiResponse } from "@shared/openapi";

export class CreateDriverGroupDto {
  @ApiProperty({ example: "Night Shift Drivers", maxLength: 80 })
  @IsString()
  @MaxLength(80)
  name!: string;

  @ApiPropertyOptional({ maxLength: 240, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(240)
  description?: string | null;

  @ApiPropertyOptional({ type: String, isArray: true, description: "The tenant's driver ids in this group" })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5000)
  @IsString({ each: true })
  driverIds?: string[];

  @ApiPropertyOptional({ default: false, description: "Track and report violations for this group's drivers" })
  @IsOptional()
  @IsBoolean()
  violationsEnabled?: boolean;
}

export class UpdateDriverGroupDto extends PartialType(CreateDriverGroupDto) {}

export class DriverGroupSchema {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ type: String, nullable: true }) description!: string | null;
  @ApiProperty() violationsEnabled!: boolean;
  @ApiProperty({ type: String, isArray: true }) driverIds!: string[];
  @ApiProperty() driverCount!: number;
  @ApiProperty() createdAt!: string;
  @ApiProperty() updatedAt!: string;
}

export class DriverGroupResponse extends StandardApiResponse<DriverGroupSchema> {
  @ApiProperty({ type: DriverGroupSchema }) data!: DriverGroupSchema;
}

export class DriverGroupListResponse extends StandardApiResponse<DriverGroupSchema[]> {
  @ApiProperty({ type: [DriverGroupSchema] }) data!: DriverGroupSchema[];
}
