import { IsIn, IsInt, IsISO8601, IsOptional, IsString, Matches, MaxLength, Min } from 'class-validator';
import { COMMUNICATION_CHANNELS } from '../communication-rates.repository';

export class ChargeUsageDto {
  @IsIn([...COMMUNICATION_CHANNELS])
  channel!: string;

  @IsInt()
  @Min(1)
  quantity!: number;

  @IsString()
  @MaxLength(255)
  reason!: string;

  /** Ties the charge to what caused it, and makes a retry idempotent. */
  @IsString()
  @Matches(/\S/, { message: 'reference must not be empty' })
  @MaxLength(255)
  reference!: string;

  @IsOptional()
  @IsISO8601()
  occurredAt?: string;
}
