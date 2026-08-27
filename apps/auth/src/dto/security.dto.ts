import { IsBoolean, IsInt, IsISO8601, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class BlockIpDto {
  @IsString()
  @MinLength(1)
  ipAddress!: string;

  @IsString()
  @MinLength(1)
  reason!: string;

  @IsOptional()
  @IsISO8601()
  expiresAt?: string;
}

export class UpdateAutoBlockRuleDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxAttempts?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  windowMinutes?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  blockDurationHours?: number | null;
}
