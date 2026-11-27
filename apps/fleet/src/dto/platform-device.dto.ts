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
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
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

/** Re-queues failed Traccar registrations; no ids means every failed device. */
export class PlatformRetryProvisioningDto {
  @ApiPropertyOptional({ type: [String], maxItems: 500 })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @Matches(/^[A-Za-z0-9_-]{1,64}$/, { each: true })
  deviceIds?: string[];
}

/** Tops a tenant up to `target` devices from platform stock. */
export class PlatformAllocateStockDto {
  @ApiProperty({ maxLength: 64 })
  @IsString()
  @MaxLength(64)
  tenantId!: string;

  @ApiProperty({ minimum: 1, maximum: 5000 })
  @IsInt()
  @Min(1)
  @Max(5000)
  target!: number;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class PlatformStockRowDto {
  @ApiProperty({ maxLength: 32 })
  @IsString()
  @MaxLength(32)
  imei!: string;

  @ApiProperty({ maxLength: 64 })
  @IsString()
  @MaxLength(64)
  manufacturer!: string;

  @ApiProperty({ maxLength: 64 })
  @IsString()
  @MaxLength(64)
  model!: string;

  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;
}

/** Devices to register as platform stock. */
export class PlatformStockImportDto {
  @ApiProperty({ type: [PlatformStockRowDto], maxItems: 20000 })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(20000)
  @ValidateNested({ each: true })
  @Type(() => PlatformStockRowDto)
  rows!: PlatformStockRowDto[];
}
