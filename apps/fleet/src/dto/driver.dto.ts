import { PartialType } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { PaginationQueryDto } from "@shared/pagination";
import {
  IsArray,
  IsEmail,
  IsIn,
  IsISO8601,
  IsNumber,
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
import {
  DRIVER_SCORE_BANDS,
  DRIVER_TRIP_BANDS,
} from "../contexts/fleet/drivers/domain/driver-roster";

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

export class DriverListQueryDto extends PaginationQueryDto {
  /** Free text across name, phone, licence and email. */
  @IsOptional()
  @IsString()
  query?: string;

  @IsOptional()
  @IsIn(DRIVER_SCORE_BANDS)
  scoreBand?: string;

  @IsOptional()
  @IsIn(DRIVER_TRIP_BANDS)
  tripBand?: string;

  @IsOptional()
  @IsIn(DRIVER_COMMUNICATION_PREFERENCES)
  preferredChannel?: string;

  @IsOptional()
  @IsIn(DRIVER_STATUS_INPUTS)
  status?: "active" | "available" | "offline" | "suspended" | "inactive";

  @IsOptional()
  @IsString()
  assigned?: string;
}

export class DriverRankingQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  period_days?: string;
}

export class SuspendDriverDto {
  /** Optional reason, recorded on the activity log entry. */
  @IsOptional()
  @IsString()
  @MaxLength(280)
  reason?: string;
}

export class RecordDriverConsentDto {
  @IsIn(["opted_in", "opted_out"])
  state!: "opted_in" | "opted_out";

  /** Where the answer came from: driver_reply, operator, import. */
  @IsOptional()
  @IsString()
  @MaxLength(32)
  source?: string;
}

export class SendDriverMessageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  message!: string;
}

export class RecordBehaviorEventDto {
  @IsString()
  driverId!: string;

  @IsOptional()
  @IsString()
  vehicleId?: string | null;

  @IsString()
  type!: string;

  @IsString()
  severity!: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  speedKph?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  latitude?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  longitude?: number | null;

  @IsOptional()
  @IsISO8601()
  occurredAt?: string;
}

export class MarkAlertsReadDto {
  @IsArray()
  @IsString({ each: true })
  alertIds!: string[];
}

export class RunFatigueAnalysisDto {
  /** Minutes driven in the period. Derived from tracking by the caller. */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  drivingMinutes?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  breakMinutes?: number | null;
}
