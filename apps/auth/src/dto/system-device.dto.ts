import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  DEVICE_LIFECYCLE_STATUSES,
  DEVICE_PROTOCOLS,
  DEVICE_STATUSES,
  TEST_TELEMETRY_IMEI,
} from '@shared/devices';

export class UpdateSystemDeviceDto {
  @ApiPropertyOptional({ maxLength: 64 })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  manufacturer?: string;

  @ApiPropertyOptional({ maxLength: 64 })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  model?: string;

  @ApiPropertyOptional({ maxLength: 32 })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  firmwareVersion?: string;

  @ApiPropertyOptional({ enum: [...DEVICE_PROTOCOLS] })
  @IsOptional()
  @IsIn(DEVICE_PROTOCOLS)
  protocol?: string;

  @ApiPropertyOptional({ enum: [...DEVICE_LIFECYCLE_STATUSES] })
  @IsOptional()
  @IsIn(DEVICE_LIFECYCLE_STATUSES)
  lifecycleStatus?: string;

  @ApiPropertyOptional({ enum: [...DEVICE_STATUSES] })
  @IsOptional()
  @IsIn(DEVICE_STATUSES)
  status?: string;
}

export class AssignSystemDevicesDto {
  @ApiProperty({ maxLength: 64 })
  @IsString()
  @MaxLength(64)
  tenantId!: string;

  @ApiProperty({ type: [String], maxItems: 100 })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  deviceIds!: string[];

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class SendTestTelemetryDto {
  @ApiProperty({ example: '359779090012345' })
  @IsString()
  @Matches(TEST_TELEMETRY_IMEI, { message: 'imei must be 15 digits' })
  imei!: string;

  @ApiPropertyOptional({ minimum: -90, maximum: 90 })
  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number;

  @ApiPropertyOptional({ minimum: -180, maximum: 180 })
  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number;
}
