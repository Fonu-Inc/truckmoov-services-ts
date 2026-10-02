import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export const MAX_QUOTA_OVERRIDE = 1_000_000;
export const QUOTA_REASON_MIN = 5;
export const QUOTA_REASON_MAX = 500;

const limitDescription =
  'Limit for this tenant. A whole number from 0, or null to remove the override and use the plan limit. Leave out to keep it as it is.';

export class UpdateTenantQuotasDto {
  @ApiPropertyOptional({ type: Number, nullable: true, description: limitDescription })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_QUOTA_OVERRIDE)
  vehicles?: number | null;

  @ApiPropertyOptional({ type: Number, nullable: true, description: limitDescription })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_QUOTA_OVERRIDE)
  drivers?: number | null;

  @ApiPropertyOptional({ type: Number, nullable: true, description: limitDescription })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_QUOTA_OVERRIDE)
  devices?: number | null;

  @ApiPropertyOptional({ type: Number, nullable: true, description: limitDescription })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_QUOTA_OVERRIDE)
  sims?: number | null;

  @ApiProperty({
    minLength: QUOTA_REASON_MIN,
    maxLength: QUOTA_REASON_MAX,
    description: 'Why the limits are changing. Recorded in the audit trail.',
  })
  @IsString()
  reason!: string;
}
