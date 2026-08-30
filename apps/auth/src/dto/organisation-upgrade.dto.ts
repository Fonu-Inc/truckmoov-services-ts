import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class RequestUpgradeDto {
  /** The requester's own words, shown to the reviewer verbatim. */
  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  reason!: string;
}

export class ReviewUpgradeDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  /** Required to approve. Not used on reject. */
  @IsOptional()
  @IsString()
  targetPlanCode?: string;
}
