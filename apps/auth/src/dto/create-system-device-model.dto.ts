import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  SYSTEM_DEVICE_CATALOG_STATUSES,
  SYSTEM_DEVICE_FEATURE_KEYS,
  SYSTEM_DEVICE_PROTOCOL_TYPES,
} from '../device-model-catalog.repository';

export class CreateSystemDeviceModelDto {
  @ApiProperty()
  @IsString()
  @MaxLength(120)
  manufacturer!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(120)
  model!: string;

  @ApiProperty({ enum: SYSTEM_DEVICE_PROTOCOL_TYPES })
  @IsEnum(SYSTEM_DEVICE_PROTOCOL_TYPES)
  protocolType!: (typeof SYSTEM_DEVICE_PROTOCOL_TYPES)[number];

  @ApiPropertyOptional({ nullable: true, type: Number })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  defaultPort?: number | null;

  @ApiProperty({ enum: SYSTEM_DEVICE_FEATURE_KEYS, isArray: true })
  @IsArray()
  @ArrayUnique()
  @IsEnum(SYSTEM_DEVICE_FEATURE_KEYS, { each: true })
  supportedFeatures!: Array<(typeof SYSTEM_DEVICE_FEATURE_KEYS)[number]>;

  @ApiProperty({ enum: SYSTEM_DEVICE_CATALOG_STATUSES })
  @IsEnum(SYSTEM_DEVICE_CATALOG_STATUSES)
  status!: (typeof SYSTEM_DEVICE_CATALOG_STATUSES)[number];

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  configurationInstructions?: string | null;
}
