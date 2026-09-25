import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional, IsString, Matches, MaxLength, ValidateNested } from 'class-validator';
import { NIGERIAN_STATES } from '../contexts/onboarding/domain/onboarding-application.validation';
import {
  INSTALLATION_TIME_SLOTS,
  MAX_INSTALLER_NOTES_LENGTH,
  MAX_REJECTION_REASON_LENGTH,
  MIN_REJECTION_REASON_LENGTH,
} from '../contexts/installation/domain/installation-order';
import {
  DISPLAY_TIME_RANGES,
  INSTALLER_SET_AVAILABILITIES,
  PREFERRED_PERIODS,
} from '../contexts/installation/domain/installer-preferences';
import { ChangeSystemPasswordDto } from './change-system-password.dto';
import {
  INSTALLER_PRIORITY_LABELS,
  INSTALLER_SUPPORT_CATEGORIES,
  MAX_TICKET_DESCRIPTION_LENGTH,
} from '../contexts/installation/domain/installer-support';
import {
  ISSUE_OUTCOMES,
  MAX_RESOLUTION_NOTE_LENGTH,
} from '../contexts/installation/application/use-cases/admin-job-changes.use-cases';

export class UpdateInstallerProfileDto {
  @ApiPropertyOptional({ example: 'Tunde' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  firstName?: string;

  @ApiPropertyOptional({ example: 'Akinwale' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  lastName?: string;

  @ApiPropertyOptional({ example: '+2348032214478' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phoneNumber?: string;

  @ApiPropertyOptional({ enum: NIGERIAN_STATES })
  @IsOptional()
  @IsString()
  state?: string;

  @ApiPropertyOptional({ example: 'Ikeja' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  city?: string;
}

export class UpdateInstallerNotificationPreferencesDto {
  @ApiPropertyOptional({ description: 'New installation offers (job_assigned)' })
  @IsOptional()
  @IsBoolean()
  newInstallationOffers?: boolean;

  @ApiPropertyOptional({ description: 'Schedule reminders (job_reminder)' })
  @IsOptional()
  @IsBoolean()
  scheduleReminders?: boolean;

  @ApiPropertyOptional({ description: 'Job and issue updates (job_updated, job_cancelled, issue_resolved, device_verified, device_verification_failed)' })
  @IsOptional()
  @IsBoolean()
  jobAndIssueUpdates?: boolean;

  @ApiPropertyOptional({ description: 'Support ticket updates (support_ticket_updated)' })
  @IsOptional()
  @IsBoolean()
  supportTicketUpdates?: boolean;

  @ApiPropertyOptional({ description: 'Send each notice by email too' })
  @IsOptional()
  @IsBoolean()
  emailAlerts?: boolean;

  @ApiPropertyOptional({ description: 'Write each notice to the notification bell' })
  @IsOptional()
  @IsBoolean()
  inPlatformAlerts?: boolean;
}

export class UpdateInstallerDisplayPreferencesDto {
  @ApiPropertyOptional({ example: 'Africa/Lagos', description: 'IANA time zone name' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  timezone?: string;

  @ApiPropertyOptional({ enum: DISPLAY_TIME_RANGES })
  @IsOptional()
  @IsIn(DISPLAY_TIME_RANGES)
  defaultTimeRange?: string;
}

export class WorkingHoursDto {
  @ApiProperty({ example: '08:00', description: 'HH:MM, 24-hour, Lagos time' })
  @IsString()
  start!: string;

  @ApiProperty({ example: '18:00', description: 'HH:MM, 24-hour, Lagos time; after start' })
  @IsString()
  end!: string;
}

export class UpdateInstallerWorkPreferencesDto {
  @ApiPropertyOptional({ enum: INSTALLER_SET_AVAILABILITIES })
  @IsOptional()
  @IsIn(INSTALLER_SET_AVAILABILITIES)
  availability?: string;

  @ApiPropertyOptional({ type: WorkingHoursDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => WorkingHoursDto)
  workingHours?: WorkingHoursDto;

  @ApiPropertyOptional({ enum: PREFERRED_PERIODS })
  @IsOptional()
  @IsIn(PREFERRED_PERIODS)
  preferredPeriods?: string;
}

export class ChangeInstallerPasswordDto extends ChangeSystemPasswordDto {}

export class BindUnitDeviceDto {
  @ApiProperty({ description: 'The fleet device fitted as this unit' })
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{1,64}$/)
  fleetDeviceId!: string;
}

export class RejectJobOfferDto {
  @ApiProperty({
    example: 'The site is outside my service route this week',
    minLength: MIN_REJECTION_REASON_LENGTH,
    maxLength: MAX_REJECTION_REASON_LENGTH,
    description: 'Trimmed before the length is checked.',
  })
  @IsString()
  reason!: string;
}

export class SetChecklistItemDto {
  @ApiProperty({ description: 'Tick or untick the item' })
  @IsBoolean()
  checked!: boolean;
}

export class SaveInstallerNotesDto {
  @ApiPropertyOptional({ nullable: true, maxLength: MAX_INSTALLER_NOTES_LENGTH })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_INSTALLER_NOTES_LENGTH)
  notes?: string | null;
}

export class CreateInstallerTicketDto {
  @ApiProperty({ enum: Object.keys(INSTALLER_SUPPORT_CATEGORIES) })
  @IsIn(Object.keys(INSTALLER_SUPPORT_CATEGORIES))
  category!: string;

  @ApiPropertyOptional({ description: "Required from the category's chips when it has any" })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  issueCode?: string;

  @ApiPropertyOptional({ description: 'One of your own jobs' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  relatedJobId?: string;

  @ApiProperty({ enum: Object.keys(INSTALLER_PRIORITY_LABELS) })
  @IsIn(Object.keys(INSTALLER_PRIORITY_LABELS))
  priority!: string;

  @ApiProperty({ maxLength: MAX_TICKET_DESCRIPTION_LENGTH })
  @IsString()
  @MaxLength(MAX_TICKET_DESCRIPTION_LENGTH)
  description!: string;

  @ApiProperty({ example: '+2348032214478' })
  @IsString()
  @MaxLength(20)
  callbackPhone!: string;
}

export class ResolveInstallationIssueDto {
  @ApiProperty({ enum: ISSUE_OUTCOMES, description: 'resume returns the job to the status the issue interrupted' })
  @IsIn(ISSUE_OUTCOMES)
  outcome!: 'resume' | 'cancel';

  @ApiPropertyOptional({ maxLength: MAX_RESOLUTION_NOTE_LENGTH })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_RESOLUTION_NOTE_LENGTH)
  note?: string;
}

export class UpdateInstallationOrderDto {
  @ApiPropertyOptional({ example: '2026-10-02', description: 'At least one day and at most 90 days ahead' })
  @IsOptional()
  @IsString()
  scheduledDate?: string;

  @ApiPropertyOptional({ enum: INSTALLATION_TIME_SLOTS })
  @IsOptional()
  @IsIn(INSTALLATION_TIME_SLOTS)
  timeSlot?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  addressLine?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  city?: string;

  @ApiPropertyOptional({ enum: NIGERIAN_STATES })
  @IsOptional()
  @IsString()
  state?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  siteContactName?: string;

  @ApiPropertyOptional({ example: '+2347014452219' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  siteContactPhone?: string;
}
