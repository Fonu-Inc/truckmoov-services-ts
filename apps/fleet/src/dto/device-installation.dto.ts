import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  ArrayNotEmpty,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
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
  @IsEnum(VERIFICATION_FAILURE_REASONS)
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
