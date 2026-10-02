import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";
import { StandardApiResponse } from "@shared/openapi";
import { REPORT_PERIODS, TREND_RANGES, type ReportPeriod, type TrendRange } from "../contexts/fleet/reports";

export class ReportsSummaryQueryDto {
  @ApiPropertyOptional({ enum: REPORT_PERIODS, default: "daily", description: "daily = today, weekly = Monday to today (Lagos time)" })
  @IsOptional()
  @IsIn(REPORT_PERIODS)
  period?: ReportPeriod;
}

export class ActivityTrendQueryDto {
  @ApiPropertyOptional({ enum: TREND_RANGES, default: "today" })
  @IsOptional()
  @IsIn(TREND_RANGES)
  range?: TrendRange;
}

export class VehicleActivityQueryDto {
  @ApiPropertyOptional({ description: "Matches reference, vehicle registration, driver name, pickup or delivery address" })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @ApiPropertyOptional({ description: "Dispatch job status, e.g. delivered" })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  status?: string;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 50, minimum: 1, maximum: 200 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}

export class ReportsPeriodSchema {
  @ApiProperty() from!: string;
  @ApiProperty() to!: string;
}

export class ReportsOperationsSchema {
  @ApiProperty() jobsCreated!: number;
  @ApiProperty() jobsCompleted!: number;
  @ApiProperty({ description: "Jobs on the road now (en-route, arrived, loaded), not limited to the period" }) jobsInProgress!: number;
  @ApiProperty() jobsCancelled!: number;
}

export class ReportsFleetSchema {
  @ApiProperty() vehiclesAdded!: number;
  @ApiProperty() driversAdded!: number;
  @ApiProperty() vehiclesInMaintenance!: number;
  @ApiProperty() activeVehicles!: number;
  @ApiProperty() totalVehicles!: number;
}

export class ReportsAdministrationSchema {
  @ApiProperty({ description: "Fleet documents plus proof-of-delivery attachments uploaded in the period" }) documentsUploaded!: number;
  @ApiProperty({ description: "Jobs booked in the period with a driver, each of which notifies that driver" }) driverCommunications!: number;
  @ApiProperty() fuelEntries!: number;
}

export class ReportsSummarySchema {
  @ApiProperty({ type: ReportsPeriodSchema }) period!: ReportsPeriodSchema;
  @ApiProperty({ type: ReportsOperationsSchema }) operations!: ReportsOperationsSchema;
  @ApiProperty({ type: ReportsFleetSchema }) fleet!: ReportsFleetSchema;
  @ApiProperty({ type: ReportsAdministrationSchema }) administration!: ReportsAdministrationSchema;
  @ApiProperty({ description: "Value of jobs completed in the period" }) revenueNgn!: number;
}

export class ReportsSummaryResponse extends StandardApiResponse<ReportsSummarySchema> {
  @ApiProperty({ type: ReportsSummarySchema }) data!: ReportsSummarySchema;
}

export class ActivityTrendPointSchema {
  @ApiProperty({ example: "Mon" }) label!: string;
  @ApiProperty() from!: string;
  @ApiProperty() to!: string;
  @ApiProperty() created!: number;
  @ApiProperty() completed!: number;
}

export class ActivityTrendResponse extends StandardApiResponse<ActivityTrendPointSchema[]> {
  @ApiProperty({ type: [ActivityTrendPointSchema] }) data!: ActivityTrendPointSchema[];
}

export class VehicleTripSchema {
  @ApiProperty() id!: string;
  @ApiProperty() reference!: string;
  @ApiProperty() status!: string;
  @ApiProperty() date!: string;
  @ApiProperty({ type: String, nullable: true, description: "Registration, null when unassigned" }) vehicle!: string | null;
  @ApiProperty({ type: String, nullable: true, description: "Driver name, null when unassigned" }) driver!: string | null;
  @ApiProperty({ type: String, nullable: true }) from!: string | null;
  @ApiProperty({ type: String, nullable: true }) to!: string | null;
  @ApiProperty() amountNgn!: number;
}

export class VehicleActivityTotalsSchema {
  @ApiProperty() trips!: number;
  @ApiProperty() completed!: number;
  @ApiProperty() open!: number;
  @ApiProperty() locationsServed!: number;
  @ApiProperty() tripValueNgn!: number;
}

export class VehicleActivitySchema {
  @ApiProperty({ type: VehicleActivityTotalsSchema, description: "Across every trip, ignoring search and status" }) totals!: VehicleActivityTotalsSchema;
  @ApiProperty({ type: [String], description: "Statuses present, for the filter" }) statuses!: string[];
  @ApiProperty({ type: [VehicleTripSchema] }) items!: VehicleTripSchema[];
  @ApiProperty() page!: number;
  @ApiProperty() limit!: number;
  @ApiProperty({ description: "Trips matching search and status" }) total!: number;
}

export class VehicleActivityResponse extends StandardApiResponse<VehicleActivitySchema> {
  @ApiProperty({ type: VehicleActivitySchema }) data!: VehicleActivitySchema;
}
