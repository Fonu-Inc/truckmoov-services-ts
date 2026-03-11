import { IsBoolean, IsOptional } from "class-validator";

export class UpdateNotificationPreferencesDto {
  @IsOptional()
  @IsBoolean()
  emailAlerts?: boolean;

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
  jobUpdates?: boolean;

  @IsOptional()
  @IsBoolean()
  marketingAnnouncements?: boolean;
}
