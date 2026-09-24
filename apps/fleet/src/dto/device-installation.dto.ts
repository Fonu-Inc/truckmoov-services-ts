import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";
import { VERIFICATION_FAILURE_REASONS } from "../contexts/fleet/devices/application/use-cases/record-verification-failure.use-case";
import { BULK_CONFIGURE_LIMIT } from "../contexts/fleet/devices/application/use-cases/bulk-configure-devices.use-case";

export class ConfigureDeviceDto {
  @ApiPropertyOptional({
    nullable: true,
    type: Number,
    description:
      "Overrides the port the catalogue gives for this model. Only for a model fitted on a second listener.",
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  port?: number | null;
}

export class BulkConfigureDevicesDto extends ConfigureDeviceDto {
  @ApiProperty({ type: String, isArray: true, maxItems: BULK_CONFIGURE_LIMIT })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  deviceIds!: string[];
}

export class RecordVerificationFailureDto {
  @ApiProperty({ enum: VERIFICATION_FAILURE_REASONS })
  @IsIn(VERIFICATION_FAILURE_REASONS)
  reason!: (typeof VERIFICATION_FAILURE_REASONS)[number];

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  detail?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description:
      "Exactly what the device sent. Kept as text and never parsed: a misconfigured device produces bytes nothing can read, and they are the only evidence of the fault.",
  })
  @IsOptional()
  @IsString()
  @MaxLength(8000)
  rawPayload?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  sourceAddress?: string | null;
}

const DEVICE_ID = /^[A-Za-z0-9_-]{1,64}$/;
const MAX_JOB_DEVICES = 100;

export class BeginJobVerificationDto {
  @ApiProperty({ type: String, isArray: true, maxItems: MAX_JOB_DEVICES })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(MAX_JOB_DEVICES)
  @Matches(DEVICE_ID, { each: true })
  deviceIds!: string[];
}

export class InstalledUnitVehicleDto {
  @ApiProperty()
  @IsString()
  @MaxLength(32)
  registrationNumber!: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  vehicleType?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  make?: string | null;

  @ApiProperty()
  @IsString()
  @MaxLength(80)
  model!: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsInt()
  year?: number | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  chassisNumber?: string | null;
}

export class InstalledUnitDto {
  @ApiProperty()
  @Matches(DEVICE_ID)
  deviceId!: string;

  @ApiProperty({ type: InstalledUnitVehicleDto })
  @ValidateNested()
  @Type(() => InstalledUnitVehicleDto)
  vehicle!: InstalledUnitVehicleDto;
}
