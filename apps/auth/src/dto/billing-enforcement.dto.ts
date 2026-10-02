import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { StandardApiResponse } from '@shared/openapi';

const STAGES = ['all', 'current', 'in_grace', 'past_grace'] as const;

export class UpdateEnforcementSettingsDto {
  @ApiPropertyOptional({ description: 'Days of grace after the due date, 0 to 30.' })
  @IsOptional() graceDays?: number;
  @ApiPropertyOptional({ description: 'Days before a licence expires that its renewal invoice is issued, 1 to 60.' })
  @IsOptional() renewalLeadDays?: number;
  @ApiPropertyOptional({ description: 'Automatic suspension on or off. Switching on needs a super admin.' })
  @IsOptional() autoSuspendEnabled?: boolean;
  @ApiPropertyOptional({ description: 'Most customers suspended in one daily run, 1 to 200.' })
  @IsOptional() autoSuspendCapPerRun?: number;
  @ApiPropertyOptional({ description: 'Pause all automatic notices and suspensions. Resuming needs a super admin.' })
  @IsOptional() paused?: boolean;
  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    description: 'Trial days for self-serve tenants, 1 to 90. Null follows the starter plan.',
  })
  @IsOptional() onboardingTrialDaysOverride?: number | null;
  @ApiProperty({ description: 'Why the change is made, 5 to 500 characters.' })
  @IsOptional() reason?: string;
}

export class ListEnforcementQueryDto {
  @ApiPropertyOptional({ enum: STAGES, default: 'all' })
  @IsOptional() @IsIn(STAGES) stage?: (typeof STAGES)[number];
  @ApiPropertyOptional({ enum: ['true', 'false'] })
  @IsOptional() @IsIn(['true', 'false']) suspended?: 'true' | 'false';
  @ApiPropertyOptional({ description: 'Matches customer name or id.' })
  @IsOptional() @IsString() q?: string;
  @ApiPropertyOptional({ default: 1 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @ApiPropertyOptional({ default: 25, maximum: 100 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize?: number;
}

class LimitSchema {
  @ApiProperty() min!: number;
  @ApiProperty() max!: number;
}

class LimitsSchema {
  @ApiProperty({ type: LimitSchema }) graceDays!: LimitSchema;
  @ApiProperty({ type: LimitSchema }) renewalLeadDays!: LimitSchema;
  @ApiProperty({ type: LimitSchema }) autoSuspendCapPerRun!: LimitSchema;
  @ApiProperty({ type: LimitSchema }) onboardingTrialDaysOverride!: LimitSchema;
}

export class EnforcementSettingsSchema {
  @ApiProperty() graceDays!: number;
  @ApiProperty() renewalLeadDays!: number;
  @ApiProperty() autoSuspendEnabled!: boolean;
  @ApiProperty() autoSuspendCapPerRun!: number;
  @ApiProperty() paused!: boolean;
  @ApiProperty({ type: Number, nullable: true }) onboardingTrialDaysOverride!: number | null;
  @ApiProperty({ type: String, nullable: true }) updatedAt!: string | null;
  @ApiProperty({ type: String, nullable: true }) updatedBy!: string | null;
  @ApiProperty({ type: LimitsSchema }) limits!: LimitsSchema;
}

export class EnforcementItemSchema {
  @ApiProperty() tenantId!: string;
  @ApiProperty() tenantName!: string;
  @ApiProperty({ example: '2026-10-01' }) dueDate!: string;
  @ApiProperty() daysOverdue!: number;
  @ApiProperty({ example: '2026-10-04', description: 'Last day of grace.' }) graceEndsAt!: string;
  @ApiProperty({ type: Number, nullable: true }) graceDaysLeft!: number | null;
  @ApiProperty({ enum: ['current', 'in_grace', 'past_grace'] }) stage!: string;
  @ApiProperty() amountOwedNgn!: number;
  @ApiProperty({ type: [String], enum: ['invoice', 'sim_monthly'] }) sources!: string[];
  @ApiProperty() items!: number;
  @ApiProperty() suspended!: boolean;
  @ApiProperty({ enum: ['manual', 'non_payment'], nullable: true }) suspensionCause!: string | null;
  @ApiProperty({ type: String, nullable: true }) suspendedAt!: string | null;
  @ApiProperty({ type: String, nullable: true }) reason!: string | null;
  @ApiProperty({ type: String, nullable: true }) cascadeStatus!: string | null;
  @ApiProperty({ type: String, nullable: true }) lastNoticeKind!: string | null;
  @ApiProperty({ type: String, nullable: true }) lastNoticeAt!: string | null;
  @ApiProperty() hasContact!: boolean;
}

export class EnforcementSummarySchema {
  @ApiProperty() inGrace!: number;
  @ApiProperty() pastGrace!: number;
  @ApiProperty() suspendedNonPayment!: number;
  @ApiProperty() suspendedManual!: number;
  @ApiProperty() owedNgn!: number;
}

export class EnforcementListSchema {
  @ApiProperty({ type: [EnforcementItemSchema] }) items!: EnforcementItemSchema[];
  @ApiProperty() page!: number;
  @ApiProperty() pageSize!: number;
  @ApiProperty() total!: number;
  @ApiProperty({ type: EnforcementSummarySchema }) summary!: EnforcementSummarySchema;
}

export class EnforcementPreviewSchema {
  @ApiProperty() generatedAt!: string;
  @ApiProperty() today!: string;
  @ApiProperty({ type: 'object', additionalProperties: true }) settings!: Record<string, unknown>;
  @ApiProperty({ type: 'array', items: { type: 'object', additionalProperties: true } })
  wouldNotify!: Record<string, unknown>[];
  @ApiProperty({ type: 'array', items: { type: 'object', additionalProperties: true } })
  wouldSuspend!: Record<string, unknown>[];
  @ApiProperty({ type: 'array', items: { type: 'object', additionalProperties: true } })
  deferred!: Record<string, unknown>[];
  @ApiProperty() totalEligible!: number;
  @ApiProperty() cappedCount!: number;
  @ApiProperty({ type: 'object', additionalProperties: { type: 'string' } }) notes!: Record<string, string>;
}

export class EnforcementSettingsResponse extends StandardApiResponse<EnforcementSettingsSchema> {
  @ApiProperty({ type: EnforcementSettingsSchema }) data!: EnforcementSettingsSchema;
}

export class EnforcementListResponse extends StandardApiResponse<EnforcementListSchema> {
  @ApiProperty({ type: EnforcementListSchema }) data!: EnforcementListSchema;
}

export class EnforcementPreviewResponse extends StandardApiResponse<EnforcementPreviewSchema> {
  @ApiProperty({ type: EnforcementPreviewSchema }) data!: EnforcementPreviewSchema;
}
