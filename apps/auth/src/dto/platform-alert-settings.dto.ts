import { IsArray, IsBoolean, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import {
  ALERT_CHANNELS,
  ALERT_SEVERITIES,
  PLATFORM_ALERT_TYPES,
} from '../platform-alert-settings.repository';

export class SendTestAlertDto {
  @IsOptional()
  @IsIn([...PLATFORM_ALERT_TYPES])
  alertType?: string;
}

export class RecordAdminNotificationDto {
  @IsString()
  @MaxLength(64)
  eventId!: string;

  @IsIn([...PLATFORM_ALERT_TYPES])
  alertType!: string;

  @IsString()
  @MaxLength(16)
  severity!: string;

  @IsString()
  @MaxLength(500)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  body?: string;
}

export class UpdateAlertSettingDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsArray()
  @IsIn([...ALERT_CHANNELS], { each: true })
  channels?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  recipients?: string[];

  @IsOptional()
  @IsIn([...ALERT_SEVERITIES])
  minSeverity?: string;
}
