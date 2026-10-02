import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { SIM_PLANS } from '../sim.repository';
import { SIM_STATUS_ACTIONS } from '../sim-status-action';

export const MAX_SIM_IMPORT_ROWS = 1000;
export const MAX_SIM_BULK_STATUS_IDS = 500;

export class RejectSimRequestDto {
  @ApiProperty({ description: 'Reason for rejecting the SIM request' })
  @IsString()
  @MinLength(1)
  reason!: string;
}

export class UpdateSystemSimDto {
  @ApiPropertyOptional({ description: 'ICCID, 18 to 20 characters' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  iccid?: string;

  @ApiPropertyOptional({ description: 'Phone number starting with +' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  msisdn?: string;

  @ApiPropertyOptional({ nullable: true, description: 'IMSI, empty clears it' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  imsi?: string | null;

  @ApiPropertyOptional({ enum: SIM_PLANS })
  @IsOptional()
  @IsIn(SIM_PLANS as unknown as string[])
  plan?: string;

  @ApiPropertyOptional({ description: 'Carrier name, free text up to 64 characters' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  carrier?: string;

  @ApiPropertyOptional({ description: 'Monthly data allowance in MB' })
  @IsOptional()
  @IsInt()
  @Min(0)
  dataLimitMb?: number;

  @ApiPropertyOptional({ description: 'Monthly SMS allowance' })
  @IsOptional()
  @IsInt()
  @Min(0)
  smsLimit?: number;
}

export class ReassignSystemSimDto {
  @ApiProperty({
    nullable: true,
    description: 'Tenant to assign the SIM to, or null to return it to the pool',
  })
  @IsOptional()
  @IsString()
  tenantId!: string | null;

  @ApiPropertyOptional({ nullable: true, description: 'Device to bind the SIM to' })
  @IsOptional()
  @IsString()
  deviceId?: string | null;
}

export class SuspendSystemSimDto {
  @ApiPropertyOptional({
    description: 'Target state; omit to toggle current suspended/active state',
  })
  @IsOptional()
  @IsBoolean()
  suspend?: boolean;
}

export class CreateSystemSimDto {
  @ApiProperty({ description: 'ICCID, 18 to 20 characters' })
  @IsString()
  @MaxLength(32)
  iccid!: string;

  @ApiProperty({ description: 'Phone number starting with +' })
  @IsString()
  @MaxLength(32)
  msisdn!: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  imsi?: string | null;

  @ApiProperty({ description: 'Carrier name, free text up to 64 characters' })
  @IsString()
  @MaxLength(64)
  carrier!: string;

  @ApiPropertyOptional({ enum: SIM_PLANS })
  @IsOptional()
  @IsIn(SIM_PLANS as unknown as string[])
  plan?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  dataLimitMb?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  smsLimit?: number;
}

export class ImportSystemSimRowDto {
  @ApiProperty()
  @IsString()
  @MaxLength(64)
  iccid!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(64)
  msisdn!: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  imsi?: string | null;

  @ApiPropertyOptional({ nullable: true, description: 'Defaults to MTN when empty' })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  carrier?: string | null;
}

export class ImportSystemSimsDto {
  @ApiProperty({ type: ImportSystemSimRowDto, isArray: true, maximum: MAX_SIM_IMPORT_ROWS })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_SIM_IMPORT_ROWS)
  @ValidateNested({ each: true })
  @Type(() => ImportSystemSimRowDto)
  rows!: ImportSystemSimRowDto[];
}

export class BulkSystemSimStatusDto {
  @ApiProperty({ type: String, isArray: true, maximum: MAX_SIM_BULK_STATUS_IDS })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_SIM_BULK_STATUS_IDS)
  @IsString({ each: true })
  ids!: string[];

  @ApiProperty({ enum: SIM_STATUS_ACTIONS })
  @IsIn(SIM_STATUS_ACTIONS as unknown as string[])
  action!: (typeof SIM_STATUS_ACTIONS)[number];
}
