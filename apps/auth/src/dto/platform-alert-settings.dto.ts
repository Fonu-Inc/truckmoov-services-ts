import { IsArray, IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';
import {
  ALERT_CHANNELS,
  ALERT_SEVERITIES,
} from '../platform-alert-settings.repository';

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
