import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsISO8601, IsOptional } from "class-validator";
import { StandardApiResponse } from "@shared/openapi";

export class AnalyticsRangeQueryDto {
  @ApiPropertyOptional({ description: "First day of the window (ISO date). Defaults to 30 days before `to`." })
  @IsOptional()
  @IsISO8601()
  from?: string;

  @ApiPropertyOptional({ description: "Last day of the window, included (ISO date). Defaults to today." })
  @IsOptional()
  @IsISO8601()
  to?: string;
}

export class ProfitLossCostsSchema {
  @ApiProperty() fuel!: number;
  @ApiProperty() maintenance!: number;
  @ApiProperty() wages!: number;
  @ApiProperty() insurance!: number;
  @ApiProperty() depreciation!: number;
  @ApiProperty() other!: number;
}

export class ProfitLossFiguresSchema {
  @ApiProperty({ description: "Amounts of delivered jobs in the window (NGN)" }) revenue!: number;
  @ApiProperty({ type: ProfitLossCostsSchema }) costs!: ProfitLossCostsSchema;
  @ApiProperty() totalCosts!: number;
  @ApiProperty() netProfit!: number;
  @ApiProperty({ description: "Net profit over revenue; 0 when there is no revenue" }) marginPercent!: number;
  @ApiProperty() deliveredJobs!: number;
}

export class ProfitLossMonthSchema {
  @ApiProperty({ example: "2026-05" }) month!: string;
  @ApiProperty() revenue!: number;
  @ApiProperty() costs!: number;
  @ApiProperty() profit!: number;
  @ApiProperty() marginPercent!: number;
}

export class ProfitLossSchema {
  @ApiProperty() from!: string;
  @ApiProperty() to!: string;
  @ApiProperty({ type: ProfitLossFiguresSchema }) summary!: ProfitLossFiguresSchema;
  @ApiProperty({ type: ProfitLossMonthSchema, isArray: true, description: "Six calendar months ending with the month that holds `to`" })
  monthly!: ProfitLossMonthSchema[];
}

export class ProfitLossResponse extends StandardApiResponse<ProfitLossSchema> {
  @ApiProperty({ type: ProfitLossSchema }) data!: ProfitLossSchema;
}

export class UtilizationSummarySchema {
  @ApiProperty() fleetSize!: number;
  @ApiProperty() avgUtilizationPercent!: number;
  @ApiProperty() idleVehicles!: number;
  @ApiProperty() fleetRevenue!: number;
  @ApiProperty({ description: "Vehicles above 70%" }) highCount!: number;
  @ApiProperty({ description: "Vehicles from 30% to 70%" }) mediumCount!: number;
  @ApiProperty({ description: "Vehicles below 30%" }) lowCount!: number;
}

export class UtilizationVehicleSchema {
  @ApiProperty() vehicleId!: string;
  @ApiProperty() plateNumber!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ nullable: true, type: String }) type!: string | null;
  @ApiProperty() status!: string;
  @ApiProperty() completedJobs!: number;
  @ApiProperty() activeJobs!: number;
  @ApiProperty({ description: "Jobs that occupied the vehicle at some point in the window" }) totalJobs!: number;
  @ApiProperty() revenue!: number;
  @ApiProperty({ description: "Days in the window with a job on the vehicle" }) activeDays!: number;
  @ApiProperty() utilizationPercent!: number;
  @ApiProperty({ nullable: true, type: String, description: "End of the latest job on the vehicle up to the end of the window" })
  lastActiveAt!: string | null;
}

export class UtilizationDaySchema {
  @ApiProperty({ example: "2026-05-01" }) date!: string;
  @ApiProperty({ description: "Vehicles with a job on them that day" }) activeVehicles!: number;
}

export class UtilizationSchema {
  @ApiProperty() from!: string;
  @ApiProperty() to!: string;
  @ApiProperty() days!: number;
  @ApiProperty({ type: UtilizationSummarySchema }) summary!: UtilizationSummarySchema;
  @ApiProperty({ type: UtilizationVehicleSchema, isArray: true }) vehicles!: UtilizationVehicleSchema[];
  @ApiProperty({ type: UtilizationDaySchema, isArray: true, description: "One entry per day in the window" }) daily!: UtilizationDaySchema[];
}

export class UtilizationResponse extends StandardApiResponse<UtilizationSchema> {
  @ApiProperty({ type: UtilizationSchema }) data!: UtilizationSchema;
}

export class FuelReportSummarySchema {
  @ApiProperty() totalLitres!: number;
  @ApiProperty() totalCostNgn!: number;
  @ApiProperty({ nullable: true, type: Number, description: "Null when no vehicle has two odometer readings in the window" })
  totalDistanceKm!: number | null;
  @ApiProperty({ nullable: true, type: Number, description: "Null when no vehicle has two odometer readings in the window" })
  avgEfficiencyKmPerLitre!: number | null;
  @ApiProperty() fillUps!: number;
  @ApiProperty() vehiclesWithFuel!: number;
}

export class FuelReportVehicleSchema {
  @ApiProperty() vehicleId!: string;
  @ApiProperty() plateNumber!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ nullable: true, type: String }) vehicleType!: string | null;
  @ApiProperty({ nullable: true, type: String }) fuelType!: string | null;
  @ApiProperty() fillUps!: number;
  @ApiProperty() litres!: number;
  @ApiProperty() costNgn!: number;
  @ApiProperty({ nullable: true, type: Number, description: "Odometer movement between the first and last fill in the window; null with fewer than two readings" })
  distanceKm!: number | null;
  @ApiProperty({ nullable: true, type: Number }) efficiencyKmPerLitre!: number | null;
  @ApiProperty({ description: "Delivered jobs in the window" }) trips!: number;
}

export class FuelReportSchema {
  @ApiProperty() from!: string;
  @ApiProperty() to!: string;
  @ApiProperty({ type: FuelReportSummarySchema }) summary!: FuelReportSummarySchema;
  @ApiProperty({ type: FuelReportVehicleSchema, isArray: true }) vehicles!: FuelReportVehicleSchema[];
}

export class FuelReportResponse extends StandardApiResponse<FuelReportSchema> {
  @ApiProperty({ type: FuelReportSchema }) data!: FuelReportSchema;
}

export class ComplianceAuditSummarySchema {
  @ApiProperty({ description: "Current documents plus driver licences" }) total!: number;
  @ApiProperty() valid!: number;
  @ApiProperty() expiring!: number;
  @ApiProperty() expired!: number;
  @ApiProperty({ description: "Drivers with no licence expiry on record" }) missing!: number;
  @ApiProperty() complianceRatePercent!: number;
  @ApiProperty() expiringIn30Days!: number;
  @ApiProperty({ description: "Vehicles holding an expired document" }) nonCompliantVehicles!: number;
}

export class ComplianceCategorySchema {
  @ApiProperty() category!: string;
  @ApiProperty() total!: number;
  @ApiProperty() valid!: number;
  @ApiProperty() expiring!: number;
  @ApiProperty() expired!: number;
  @ApiProperty() missing!: number;
  @ApiProperty() complianceRatePercent!: number;
}

export class AuditCountByEntitySchema {
  @ApiProperty() entityType!: string;
  @ApiProperty() count!: number;
}

export class AuditCountByActionSchema {
  @ApiProperty() action!: string;
  @ApiProperty() count!: number;
}

export class AuditActivitySchema {
  @ApiProperty() totalEvents!: number;
  @ApiProperty({ type: AuditCountByEntitySchema, isArray: true }) byEntityType!: AuditCountByEntitySchema[];
  @ApiProperty({ type: AuditCountByActionSchema, isArray: true }) topActions!: AuditCountByActionSchema[];
  @ApiProperty({ description: "True when the log held more entries than were counted" }) truncated!: boolean;
}

export class ComplianceAuditSchema {
  @ApiProperty() from!: string;
  @ApiProperty() to!: string;
  @ApiProperty({ type: ComplianceAuditSummarySchema }) summary!: ComplianceAuditSummarySchema;
  @ApiProperty({ type: ComplianceCategorySchema, isArray: true }) categories!: ComplianceCategorySchema[];
  @ApiProperty({ type: AuditActivitySchema, nullable: true, description: "Null for roles that may not read the audit log" })
  activity!: AuditActivitySchema | null;
}

export class ComplianceAuditResponse extends StandardApiResponse<ComplianceAuditSchema> {
  @ApiProperty({ type: ComplianceAuditSchema }) data!: ComplianceAuditSchema;
}
