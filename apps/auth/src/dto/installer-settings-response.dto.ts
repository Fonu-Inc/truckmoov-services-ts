import { ApiProperty } from '@nestjs/swagger';
import { StandardApiResponse } from '@shared/openapi';
import { INSTALLER_STATUSES } from '../contexts/installation/domain/installer';
import {
  DISPLAY_TIME_RANGES,
  INSTALLER_SET_AVAILABILITIES,
  PREFERRED_PERIODS,
} from '../contexts/installation/domain/installer-preferences';

const NULLABLE_STRING = { type: String, nullable: true } as const;

export class InstallerProfilePersonalSchema {
  @ApiProperty({ example: 'Tunde' }) firstName!: string;
  @ApiProperty({ example: 'Akinwale' }) lastName!: string;
  @ApiProperty({ example: 'tunde@fieldops.ng' }) email!: string;
  @ApiProperty({ example: '+2348032214478' }) phoneNumber!: string;
  @ApiProperty({ ...NULLABLE_STRING, example: 'Lagos' }) state!: string | null;
  @ApiProperty({ ...NULLABLE_STRING, example: 'Ikeja', description: 'City / base location' }) city!: string | null;
  @ApiProperty({ ...NULLABLE_STRING, description: 'Signed link that expires; null without a photo.' }) photoUrl!: string | null;
}

export class InstallerProfileRecordSchema {
  @ApiProperty({ example: 'INS-0001' }) code!: string;
  @ApiProperty({ enum: [...INSTALLER_STATUSES] }) status!: string;
  @ApiProperty({ type: [String], example: ['Lagos', 'Ogun'], description: 'Set by the platform admin.' }) serviceAreas!: string[];
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
}

export class InstallerProfileSchema {
  @ApiProperty({ type: InstallerProfilePersonalSchema }) personal!: InstallerProfilePersonalSchema;
  @ApiProperty({ type: InstallerProfileRecordSchema, description: 'Read-only.' }) record!: InstallerProfileRecordSchema;
}

export class InstallerProfileResponse extends StandardApiResponse<InstallerProfileSchema> {
  @ApiProperty({ type: InstallerProfileSchema }) data!: InstallerProfileSchema;
}

export class InstallerSessionUserSchema {
  @ApiProperty() id!: string;
  @ApiProperty() email!: string;
  @ApiProperty({ example: 'INSTALLER' }) role!: string;
  @ApiProperty({ example: 'system' }) tenantId!: string;
}

export class InstallerSessionSchema {
  @ApiProperty() accessToken!: string;
  @ApiProperty() refreshToken!: string;
  @ApiProperty({ example: 3600, description: 'Seconds the access token lasts.' }) expiresIn!: number;
  @ApiProperty({ type: InstallerSessionUserSchema }) user!: InstallerSessionUserSchema;
}

export class InstallerPasswordChangedResponse extends StandardApiResponse<InstallerSessionSchema> {
  @ApiProperty({ type: InstallerSessionSchema, description: 'Every earlier session is ended; use these tokens from now on.' })
  data!: InstallerSessionSchema;
}

export class InstallerNotificationPreferencesSchema {
  @ApiProperty({ description: 'job_assigned' }) newInstallationOffers!: boolean;
  @ApiProperty({ description: 'job_reminder' }) scheduleReminders!: boolean;
  @ApiProperty({ description: 'job_updated, job_cancelled, issue_resolved, device_verified, device_verification_failed' })
  jobAndIssueUpdates!: boolean;
  @ApiProperty({ description: 'support_ticket_updated' }) supportTicketUpdates!: boolean;
  @ApiProperty({ description: 'Email each notice the type toggles let through.' }) emailAlerts!: boolean;
  @ApiProperty({ description: 'Write each notice the type toggles let through to the inbox.' }) inPlatformAlerts!: boolean;
}

export class InstallerNotificationPreferencesResponse extends StandardApiResponse<InstallerNotificationPreferencesSchema> {
  @ApiProperty({ type: InstallerNotificationPreferencesSchema }) data!: InstallerNotificationPreferencesSchema;
}

export class InstallerDisplayPreferencesSchema {
  @ApiProperty({ example: 'Africa/Lagos', description: 'IANA time zone name.' }) timezone!: string;
  @ApiProperty({ enum: DISPLAY_TIME_RANGES, example: 'last_7_days' }) defaultTimeRange!: string;
}

export class InstallerDisplayPreferencesResponse extends StandardApiResponse<InstallerDisplayPreferencesSchema> {
  @ApiProperty({ type: InstallerDisplayPreferencesSchema }) data!: InstallerDisplayPreferencesSchema;
}

export class WorkingHoursSchema {
  @ApiProperty({ example: '08:00', description: 'HH:MM, 24-hour, Lagos time.' }) start!: string;
  @ApiProperty({ example: '18:00', description: 'HH:MM, 24-hour, Lagos time.' }) end!: string;
}

export class InstallerWorkPreferencesSchema {
  @ApiProperty({ enum: INSTALLER_SET_AVAILABILITIES, description: 'unavailable: offered no new jobs.' }) availability!: string;
  @ApiProperty({ type: WorkingHoursSchema, description: 'Offered only jobs whose slot overlaps these hours.' })
  workingHours!: WorkingHoursSchema;
  @ApiProperty({ enum: PREFERRED_PERIODS, description: 'weekdays: Monday to Friday; weekends: Saturday and Sunday.' })
  preferredPeriods!: string;
  @ApiProperty({ type: [String], example: ['Lagos', 'Ogun'], description: 'Read-only; set by the platform admin.' })
  serviceAreas!: string[];
}

export class InstallerWorkPreferencesResponse extends StandardApiResponse<InstallerWorkPreferencesSchema> {
  @ApiProperty({ type: InstallerWorkPreferencesSchema }) data!: InstallerWorkPreferencesSchema;
}
