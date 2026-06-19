import { IsBoolean, IsOptional } from "class-validator";

export class UpdateNotificationPreferencesDto {
  @IsOptional()
  @IsBoolean()
  smsAlerts?: boolean;

  @IsOptional()
  @IsBoolean()
  pushAlerts?: boolean;

  @IsOptional()
  @IsBoolean()
  incidentAlerts?: boolean;

  @IsOptional()
  @IsBoolean()
  jobAssignment?: boolean;

  @IsOptional()
  @IsBoolean()
  jobCompletion?: boolean;

  @IsOptional()
  @IsBoolean()
  maintenanceReminders?: boolean;

  @IsOptional()
  @IsBoolean()
  fuelAlerts?: boolean;

  @IsOptional()
  @IsBoolean()
  geofenceAlerts?: boolean;

  @IsOptional()
  @IsBoolean()
  emailDigest?: boolean;
}
