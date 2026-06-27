import { PartialType } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsArray,
  IsEmail,
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from "class-validator";
import {
  DRIVER_COMMUNICATION_PREFERENCES,
  DRIVER_STATUS_INPUTS,
} from "../contexts/fleet/drivers/domain/entities/driver.entity";

export class CreateDriverDto {
  /** Legacy full-name field accepted for backward compatibility */
  @IsOptional()
  @IsString()
  name?: string;

  /** Driver first name */
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  firstName?: string;

  /** Driver last name */
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  lastName?: string;

  /** Preferred phone number shown in the UI */
  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string;

  /** Driver email address */
  @IsOptional()
  @IsEmail()
  email?: string;

  /** Driver license number */
  @IsString()
  licenseNumber!: string;

  /** Driver license expiry date */
  @IsOptional()
  @IsISO8601()
  licenseExpiryDate?: string;

  /** Operational availability status */
  @IsOptional()
  @IsIn(DRIVER_STATUS_INPUTS)
  status?: "active" | "available" | "offline" | "suspended" | "inactive";

  /** Preferred communication channel */
  @IsOptional()
  @IsIn(DRIVER_COMMUNICATION_PREFERENCES)
  communicationPreference?: "whatsapp" | "sms" | "email" | "voice";
}

export class UpdateDriverDto extends PartialType(CreateDriverDto) {}

export class SetDriverStatusDto {
  @IsIn(DRIVER_STATUS_INPUTS)
  status!: "active" | "available" | "offline" | "suspended" | "inactive";
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
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  lastName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsString()
  licenseNumber!: string;

  @IsOptional()
  @IsISO8601()
  licenseExpiryDate?: string;

  @IsOptional()
  @IsIn(DRIVER_STATUS_INPUTS)
  status?: "active" | "available" | "offline" | "suspended" | "inactive";

  @IsOptional()
  @IsIn(DRIVER_COMMUNICATION_PREFERENCES)
  communicationPreference?: "whatsapp" | "sms" | "email" | "voice";

  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateDriverContactChannelsDto)
  contactChannels?: UpdateDriverContactChannelsDto;
}

export class BulkImportDriversDto {

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
  @IsIn(DRIVER_STATUS_INPUTS)
  status?: "active" | "available" | "offline" | "suspended" | "inactive";

  @IsOptional()
  @IsString()
  assigned?: string;
}
