import { PartialType } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  ValidateNested,
} from "class-validator";
import { FLEET_ASSET_STATUSES } from "../contexts/fleet/shared/domain/fleet-status";

export class CreateDriverDto {
  /** Driver's full name */
  @IsString()
  name!: string;

  /** Driver license number */
  @IsString()
  licenseNumber!: string;

  /** Tenant scope; defaults to DEFAULT_TENANT env */
  @IsOptional()
  @IsString()
  tenantId?: string;

  /** Operational availability status */
  @IsOptional()
  @IsIn(FLEET_ASSET_STATUSES)
  status?: "active" | "inactive";
}

export class UpdateDriverDto extends PartialType(CreateDriverDto) {}

export class SetDriverStatusDto {
  @IsIn(FLEET_ASSET_STATUSES)
  status!: "active" | "inactive";
}

export class UpdateDriverContactChannelsDto {
  @IsOptional()
  @IsString()
  whatsappNumber?: string | null;

  @IsOptional()
  @IsString()
  smsNumber?: string | null;

  @IsOptional()
  @IsString()
  voiceNumber?: string | null;
}

export class DriverImportItemDto {
  @IsString()
  name!: string;

  @IsString()
  licenseNumber!: string;

  @IsOptional()
  @IsString()
  tenantId?: string;

  @IsOptional()
  @IsIn(FLEET_ASSET_STATUSES)
  status?: "active" | "inactive";

  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateDriverContactChannelsDto)
  contactChannels?: UpdateDriverContactChannelsDto;
}

export class BulkImportDriversDto {
  @IsOptional()
  @IsString()
  tenantId?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DriverImportItemDto)
  items!: DriverImportItemDto[];
}

export class DriverListQueryDto {
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

export class JobListQueryDto {
  @IsOptional()
  @IsString()
  query?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  tenantId?: string;
}
