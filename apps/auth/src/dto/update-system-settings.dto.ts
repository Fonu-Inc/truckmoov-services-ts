import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { DEFAULT_TIME_RANGES, SESSION_TIMEOUT_OPTIONS } from '../system-settings.repository';
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
  PLATFORM_CURRENCIES,
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

  @ApiPropertyOptional({ enum: DEFAULT_TIME_RANGES })
  @IsOptional()
  @IsIn(DEFAULT_TIME_RANGES)
  defaultTimeRange?: string;

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

  @IsOptional()
  @IsIn(PLATFORM_CURRENCIES)
  platformCurrency?: (typeof PLATFORM_CURRENCIES)[number];
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

  @IsOptional()
  @IsBoolean()
  internationalCurrency?: boolean;
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

export class SystemSettingsSecurityDto {
  @ApiPropertyOptional({ description: 'Require two-factor for every admin account' })
  @IsOptional()
  @IsBoolean()
  requireTwoFactor?: boolean;

  @ApiPropertyOptional({ enum: SESSION_TIMEOUT_OPTIONS, description: 'Idle minutes before logout' })
  @IsOptional()
  @Type(() => Number)
  @IsIn(SESSION_TIMEOUT_OPTIONS as unknown as number[])
  sessionTimeoutMinutes?: number;

  @ApiPropertyOptional({ description: 'Write an activity record for administrative actions' })
  @IsOptional()
  @IsBoolean()
  auditLogging?: boolean;
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

  @ApiPropertyOptional({ type: SystemSettingsSecurityDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => SystemSettingsSecurityDto)
  security?: SystemSettingsSecurityDto;
}
