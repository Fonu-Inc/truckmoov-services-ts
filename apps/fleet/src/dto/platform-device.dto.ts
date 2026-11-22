import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  DEVICE_LIFECYCLE_STATUSES,
  DEVICE_PROTOCOLS,
  DEVICE_STATUSES,
} from '@shared/devices';

/** What a platform admin may correct on a device record. */
export class PlatformUpdateDeviceDto {
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

  @ApiPropertyOptional({ minimum: 1, maximum: 65535 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(65535)
  port?: number;
}

/** Moves one or more platform-held devices to a tenant. */
export class PlatformAssignDevicesDto {
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
