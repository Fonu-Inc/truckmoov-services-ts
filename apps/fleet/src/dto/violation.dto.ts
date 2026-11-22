import { ApiProperty, ApiPropertyOptional, PartialType } from "@nestjs/swagger";
import { IsArray, IsBoolean, IsIn, IsInt, IsObject, IsOptional, IsString, MaxLength } from "class-validator";
import { StandardApiResponse } from "@shared/openapi";
import {
  QUOTA_PERIODS,
  RULE_ENTITIES,
  RULE_SCOPES,
  RULE_STATUSES,
  VIOLATION_SEVERITIES,
  VIOLATION_STATUSES,
  VIOLATION_TYPES,
} from "../violations.domain";

export class CreateViolationRuleDto {
  @ApiProperty({ enum: RULE_ENTITIES, description: "Whether the rule sits on the drivers or the vehicles Violations page" })
  @IsIn(RULE_ENTITIES as unknown as string[])
  entity!: string;

  @ApiProperty({ example: "Highway speeding", maxLength: 80 })
  @IsString()
  @MaxLength(80)
  name!: string;

  @ApiPropertyOptional({ maxLength: 240, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(240)
  description?: string | null;

  @ApiProperty({ enum: VIOLATION_TYPES })
  @IsIn(VIOLATION_TYPES as unknown as string[])
  type!: string;

  @ApiPropertyOptional({
    description:
      "overspeeding: { speedKph, minDurationSeconds }; restricted_hours: { restrictedStart, restrictedEnd, restrictedDays }; harsh_*: { thresholdG } (display only — trackers report the event, not a force)",
  })
  @IsOptional()
  @IsObject()
  trigger?: Record<string, unknown>;

  @ApiProperty({ enum: RULE_SCOPES })
  @IsIn(RULE_SCOPES as unknown as string[])
  scope!: string;

  @ApiPropertyOptional({ type: String, isArray: true, description: "Driver or vehicle ids for a selected_* scope" })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  scopeIds?: string[];

  @ApiPropertyOptional({ description: '{ mode: "always" } or { mode: "scheduled", days: ["Mon", ...], start: "06:00", end: "22:00" } (Lagos time)' })
  @IsOptional()
  @IsObject()
  schedule?: Record<string, unknown>;

  @ApiProperty({ enum: VIOLATION_SEVERITIES })
  @IsIn(VIOLATION_SEVERITIES as unknown as string[])
  severity!: string;

  @ApiPropertyOptional({ default: 10 })
  @IsOptional()
  @IsInt()
  quota?: number;

  @ApiPropertyOptional({ enum: QUOTA_PERIODS, default: "monthly" })
  @IsOptional()
  @IsIn(QUOTA_PERIODS as unknown as string[])
  quotaPeriod?: string;

  @ApiPropertyOptional({ default: 5, description: "Violations of this rule in one quota period that make a repeat offender" })
  @IsOptional()
  @IsInt()
  repeatThreshold?: number;

  @ApiPropertyOptional({ default: true, description: "Raise an in-app alert for each violation" })
  @IsOptional()
  @IsBoolean()
  notify?: boolean;

  @ApiPropertyOptional({ enum: RULE_STATUSES, default: "active" })
  @IsOptional()
  @IsIn(RULE_STATUSES as unknown as string[])
  status?: string;
}

export class UpdateViolationRuleDto extends PartialType(CreateViolationRuleDto) {}

export class SetViolationStatusDto {
  @ApiProperty({ enum: VIOLATION_STATUSES })
  @IsIn(VIOLATION_STATUSES as unknown as string[])
  status!: string;
}

export class ViolationRuleSchema {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: RULE_ENTITIES }) entity!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ type: String, nullable: true }) description!: string | null;
  @ApiProperty({ enum: VIOLATION_TYPES }) type!: string;
  @ApiProperty({ type: Object }) trigger!: Record<string, unknown>;
  @ApiProperty({ description: "The trigger as shown in the rules table, e.g. 100 km/h" }) threshold!: string;
  @ApiProperty({ enum: RULE_SCOPES }) scope!: string;
  @ApiProperty({ type: String, isArray: true }) scopeIds!: string[];
  @ApiProperty({ type: Object }) schedule!: Record<string, unknown>;
  @ApiProperty({ enum: VIOLATION_SEVERITIES }) severity!: string;
  @ApiProperty() quota!: number;
  @ApiProperty({ enum: QUOTA_PERIODS }) quotaPeriod!: string;
  @ApiProperty() repeatThreshold!: number;
  @ApiProperty() notify!: boolean;
  @ApiProperty({ enum: RULE_STATUSES }) status!: string;
  @ApiProperty({ description: "Violations this rule has raised" }) violationCount!: number;
  @ApiProperty() createdAt!: string;
  @ApiProperty() updatedAt!: string;
}

export class ViolationSchema {
  @ApiProperty() id!: string;
  @ApiProperty() ruleId!: string;
  @ApiProperty() ruleName!: string;
  @ApiProperty({ enum: RULE_ENTITIES }) entity!: string;
  @ApiProperty({ enum: VIOLATION_TYPES }) type!: string;
  @ApiProperty({ type: String, nullable: true }) driverId!: string | null;
  @ApiProperty({ type: String, nullable: true }) vehicleId!: string | null;
  @ApiProperty({ example: "112 km/h" }) recordedValue!: string;
  @ApiProperty({ example: "100 km/h" }) threshold!: string;
  @ApiProperty({ enum: VIOLATION_SEVERITIES }) severity!: string;
  @ApiProperty({ type: Number, nullable: true }) latitude!: number | null;
  @ApiProperty({ type: Number, nullable: true }) longitude!: number | null;
  @ApiProperty() occurredAt!: string;
  @ApiProperty({ enum: VIOLATION_STATUSES }) status!: string;
}

export class ViolationQuotaSchema {
  @ApiProperty() ruleId!: string;
  @ApiProperty() used!: number;
  @ApiProperty() quota!: number;
  @ApiProperty({ enum: QUOTA_PERIODS }) period!: string;
  @ApiProperty() exceeded!: boolean;
}

export class ViolationSubjectSchema {
  @ApiProperty({ description: "Driver id on the drivers page, vehicle id on the vehicles page" }) subjectId!: string;
  @ApiProperty() total!: number;
  @ApiProperty() critical!: number;
  @ApiProperty({ enum: VIOLATION_TYPES }) mostFrequent!: string;
  @ApiProperty() lastAt!: string;
  @ApiProperty({ type: ViolationQuotaSchema, nullable: true, description: "Use of the quota of the rule they last broke" })
  quota!: ViolationQuotaSchema | null;

  @ApiProperty() repeatOffender!: boolean;
}

export class ViolationSummarySchema {
  @ApiProperty() total!: number;
  @ApiProperty() criticalCount!: number;
  @ApiProperty() subjectsWithViolations!: number;
  @ApiProperty() repeatOffenders!: number;
  @ApiProperty({ type: [ViolationSubjectSchema] }) subjects!: ViolationSubjectSchema[];
  @ApiProperty({ type: [ViolationSchema], description: "Newest first, at most 500" }) items!: ViolationSchema[];
}

export class ViolationRuleResponse extends StandardApiResponse<ViolationRuleSchema> {
  @ApiProperty({ type: ViolationRuleSchema }) data!: ViolationRuleSchema;
}

export class ViolationRuleListResponse extends StandardApiResponse<ViolationRuleSchema[]> {
  @ApiProperty({ type: [ViolationRuleSchema] }) data!: ViolationRuleSchema[];
}

export class ViolationResponse extends StandardApiResponse<ViolationSchema> {
  @ApiProperty({ type: ViolationSchema }) data!: ViolationSchema;
}

export class ViolationSummaryResponse extends StandardApiResponse<ViolationSummarySchema> {
  @ApiProperty({ type: ViolationSummarySchema }) data!: ViolationSummarySchema;
}
