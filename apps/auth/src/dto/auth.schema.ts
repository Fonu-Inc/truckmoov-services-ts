import { ApiProperty } from "@nestjs/swagger";
import { StandardApiResponse } from "@shared/openapi";

export class SessionSchema {
  /** JWT access token */
  accessToken!: string;
  /** JWT refresh token */
  refreshToken!: string;
}

export class AuthResponse extends StandardApiResponse<SessionSchema> {
  @ApiProperty({ type: SessionSchema })
  data!: SessionSchema;
}

export class MeResponse extends StandardApiResponse<Record<string, unknown>> {
  @ApiProperty({ type: "object", additionalProperties: true })
  data!: Record<string, unknown>;
}

export class HealthResponse extends StandardApiResponse<{
  service: string;
  persistenceBackend: string;
  database: "up" | "n/a";
}> {
  @ApiProperty({
    type: "object",
    properties: {
      service: { type: "string" },
      persistenceBackend: { type: "string" },
      database: { type: "string", enum: ["up", "n/a"] },
    },
  })
  data!: {
    service: string;
    persistenceBackend: string;
    database: "up" | "n/a";
  };
}

export class UserProfileSchema {
  @ApiProperty({ nullable: true })
  fullName!: string | null;

  @ApiProperty({ nullable: true })
  phoneNumber!: string | null;
}

export class ProfileDataSchema {
  @ApiProperty()
  userId!: string;

  @ApiProperty()
  email!: string;

  @ApiProperty()
  tenantId!: string;

  @ApiProperty({ type: "string", isArray: true })
  roles!: string[];

  @ApiProperty({ type: UserProfileSchema })
  profile!: UserProfileSchema;
}

export class ProfileResponse extends StandardApiResponse<ProfileDataSchema> {
  @ApiProperty({ type: ProfileDataSchema })
  data!: ProfileDataSchema;
}

export class NotificationPreferencesSchema {
  @ApiProperty()
  emailAlerts!: boolean;

  @ApiProperty()
  smsAlerts!: boolean;

  @ApiProperty()
  pushAlerts!: boolean;

  @ApiProperty()
  incidentAlerts!: boolean;

  @ApiProperty()
  jobUpdates!: boolean;

  @ApiProperty()
  marketingAnnouncements!: boolean;
}

export class NotificationPreferencesDataSchema {
  @ApiProperty()
  userId!: string;

  @ApiProperty({ type: NotificationPreferencesSchema })
  notificationPreferences!: NotificationPreferencesSchema;
}

export class NotificationPreferencesResponse extends StandardApiResponse<NotificationPreferencesDataSchema> {
  @ApiProperty({ type: NotificationPreferencesDataSchema })
  data!: NotificationPreferencesDataSchema;
}

export class DispatcherPreferencesSchema {
  @ApiProperty()
  timezone!: string;

  @ApiProperty()
  shiftStart!: string;

  @ApiProperty()
  shiftEnd!: string;

  @ApiProperty({ type: "number", isArray: true })
  workDays!: number[];
}

export class DispatcherPreferencesDataSchema {
  @ApiProperty()
  userId!: string;

  @ApiProperty({ type: DispatcherPreferencesSchema })
  dispatcherPreferences!: DispatcherPreferencesSchema;
}

export class DispatcherPreferencesResponse extends StandardApiResponse<DispatcherPreferencesDataSchema> {
  @ApiProperty({ type: DispatcherPreferencesDataSchema })
  data!: DispatcherPreferencesDataSchema;
}

export class OrganizationBrandingSchema {
  @ApiProperty()
  organizationName!: string;

  @ApiProperty({ nullable: true })
  logoUrl!: string | null;

  @ApiProperty({ nullable: true })
  primaryColor!: string | null;

  @ApiProperty({ nullable: true })
  secondaryColor!: string | null;
}

export class OrganizationDefaultsSchema {
  @ApiProperty()
  timezone!: string;

  @ApiProperty()
  currency!: string;

  @ApiProperty({ enum: ["DD/MM/YYYY", "MM/DD/YYYY", "YYYY-MM-DD"] })
  dateFormat!: "DD/MM/YYYY" | "MM/DD/YYYY" | "YYYY-MM-DD";

  @ApiProperty({ enum: ["monday", "sunday"] })
  weekStartsOn!: "monday" | "sunday";
}

export class OrganizationSettingsSchema {
  @ApiProperty()
  tenantId!: string;

  @ApiProperty({ type: OrganizationBrandingSchema })
  branding!: OrganizationBrandingSchema;

  @ApiProperty({ type: OrganizationDefaultsSchema })
  defaults!: OrganizationDefaultsSchema;
}

export class OrganizationSettingsResponse extends StandardApiResponse<OrganizationSettingsSchema> {
  @ApiProperty({ type: OrganizationSettingsSchema })
  data!: OrganizationSettingsSchema;
}
