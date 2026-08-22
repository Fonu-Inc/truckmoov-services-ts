import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  MAX_COMPLIANCE_REMINDER_DAYS,
  SYSTEM_BACKUP_FREQUENCIES,
} from '../system-settings.repository';

class SystemSettingsDefaultsDto {
  @IsOptional()
  @IsString()
  timezone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  language?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_COMPLIANCE_REMINDER_DAYS)
  @Type(() => Number)
  complianceReminderDays?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Type(() => Number)
  walletTopUpMin?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Type(() => Number)
  walletTopUpMax?: number;
}

class SystemSettingsFeaturesDto {
  @IsOptional()
  @IsBoolean()
  allowNewTenantRegistration?: boolean;

  @IsOptional()
  @IsBoolean()
  maintenanceMode?: boolean;

  @IsOptional()
  @IsBoolean()
  enableBetaFeatures?: boolean;
}

class SystemSettingsRetentionDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  gpsDataRetentionDays?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  logRetentionDays?: number;

  @IsOptional()
  @IsIn(SYSTEM_BACKUP_FREQUENCIES)
  backupFrequency?: (typeof SYSTEM_BACKUP_FREQUENCIES)[number];
}

export class UpdateSystemSettingsDto {
  @IsOptional()
  @IsString()
  @MaxLength(160)
  platformName?: string;

  @IsOptional()
  @IsEmail()
  supportEmail?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => SystemSettingsDefaultsDto)
  defaults?: SystemSettingsDefaultsDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => SystemSettingsFeaturesDto)
  features?: SystemSettingsFeaturesDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => SystemSettingsRetentionDto)
  retention?: SystemSettingsRetentionDto;
}
