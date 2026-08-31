import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsIn, IsInt, IsObject, IsOptional, IsString, Min } from 'class-validator';
import { LIMIT_BEHAVIOURS, ORGANISATION_TYPES, PAYMENT_MODELS, USAGE_ITEMS, type UsageItem } from '../plan-entitlements';

export class UpdatePlanEntitlementsDto {
  @ApiPropertyOptional({ enum: PAYMENT_MODELS })
  @IsOptional()
  @IsIn(PAYMENT_MODELS)
  paymentModel?: (typeof PAYMENT_MODELS)[number];

  @ApiPropertyOptional({ type: Object, description: 'Resource quotas. Values are non-negative integers or unlimited.' })
  @IsOptional()
  @IsObject()
  quotas?: Record<string, number | 'unlimited'>;

  @ApiPropertyOptional({ type: Object, description: 'Resource limit behaviours.' })
  @IsOptional()
  @IsObject()
  limitBehaviour?: Record<string, (typeof LIMIT_BEHAVIOURS)[number]>;

  @ApiPropertyOptional({ type: Array, description: 'Stable feature entitlements with key, label, enabled, and limit.' })
  @IsOptional()
  @IsArray()
  features?: Array<{ key: string; label: string; enabled: boolean; limit: number | null }>;

  @ApiPropertyOptional({ type: Array, description: 'Included monthly usage allowances.' })
  @IsOptional()
  @IsArray()
  allowances?: Array<{ item: UsageItem; includedPerMonth: number }>;

  @ApiPropertyOptional({ enum: ORGANISATION_TYPES, isArray: true })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  availableFor?: Array<(typeof ORGANISATION_TYPES)[number]>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  trialDays?: number;
}
