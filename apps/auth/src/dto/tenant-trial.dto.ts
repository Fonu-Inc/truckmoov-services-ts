import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { MAX_TRIAL_EXTENSION_DAYS } from '../tenant-trial';

export class ExtendTenantTrialDto {
  @ApiProperty({ minimum: 1, maximum: MAX_TRIAL_EXTENSION_DAYS, description: 'Days to add to the trial end.' })
  @IsInt()
  @Min(1)
  @Max(MAX_TRIAL_EXTENSION_DAYS)
  days!: number;

  @ApiProperty({ minLength: 5, maxLength: 500, description: 'Why the trial is extended. Recorded in the audit trail.' })
  @IsString()
  reason!: string;
}

export class ConvertTenantTrialDto {
  @ApiPropertyOptional({ minLength: 5, maxLength: 500, description: 'Optional note for the audit trail.' })
  @IsOptional()
  @IsString()
  reason?: string;
}
