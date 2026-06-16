import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';
import { SIM_CARRIERS, SIM_PLANS } from '../sim.repository';

export class RejectSimRequestDto {
  @ApiProperty({ description: 'Reason for rejecting the SIM request' })
  @IsString()
  @MinLength(1)
  reason!: string;
}

export class UpdateSystemSimDto {
  @ApiPropertyOptional({ enum: SIM_PLANS })
  @IsOptional()
  @IsIn(SIM_PLANS as unknown as string[])
  plan?: string;

  @ApiPropertyOptional({ enum: SIM_CARRIERS })
  @IsOptional()
  @IsIn(SIM_CARRIERS as unknown as string[])
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
