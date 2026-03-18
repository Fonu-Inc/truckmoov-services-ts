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

export class UploadedMediaSchema {
  @ApiProperty()
  key!: string;

  @ApiProperty()
  url!: string;

  @ApiProperty()
  filename!: string;

  @ApiProperty()
  contentType!: string;

  @ApiProperty()
  size!: number;
}

export class UploadedMediaResponse extends StandardApiResponse<UploadedMediaSchema> {
  @ApiProperty({ type: UploadedMediaSchema })
  data!: UploadedMediaSchema;
}

export class UserProfileSchema {
  @ApiProperty({ nullable: true })
  fullName!: string | null;

  @ApiProperty({ nullable: true })
  phoneNumber!: string | null;

  @ApiProperty({ nullable: true })
  address!: string | null;

  @ApiProperty({ nullable: true })
  profilePictureUrl!: string | null;
}

export class ProfileDataSchema {
  @ApiProperty()
  userId!: string;

  @ApiProperty()
  email!: string;

  @ApiProperty()
  tenantId!: string;

  @ApiProperty()
  role!: string;

  @ApiProperty({ type: UserProfileSchema })
  profile!: UserProfileSchema;
}

export class ProfileResponse extends StandardApiResponse<ProfileDataSchema> {
  @ApiProperty({ type: ProfileDataSchema })
  data!: ProfileDataSchema;
}

export class OrganizationUserSchema {
  @ApiProperty()
  userId!: string;

  @ApiProperty()
  email!: string;

  @ApiProperty()
  tenantId!: string;

  @ApiProperty()
  role!: string;

  @ApiProperty({ type: UserProfileSchema })
  profile!: UserProfileSchema;
}

export class OrganizationUsersDataSchema {
  @ApiProperty()
  tenantId!: string;

  @ApiProperty({ type: OrganizationUserSchema, isArray: true })
  users!: OrganizationUserSchema[];
}

export class OrganizationUsersResponse extends StandardApiResponse<OrganizationUsersDataSchema> {
  @ApiProperty({ type: OrganizationUsersDataSchema })
  data!: OrganizationUsersDataSchema;
}

export class OrganizationUserDataSchema {
  @ApiProperty()
  message!: string;

  @ApiProperty({ type: OrganizationUserSchema })
  user!: OrganizationUserSchema;
}

export class OrganizationUserResponse extends StandardApiResponse<OrganizationUserDataSchema> {
  @ApiProperty({ type: OrganizationUserDataSchema })
  data!: OrganizationUserDataSchema;
}

export class InviteActionDataSchema {
  @ApiProperty()
  message!: string;

  @ApiProperty()
  email!: string;

  @ApiProperty()
  role!: string;
}

export class InviteActionResponse extends StandardApiResponse<InviteActionDataSchema> {
  @ApiProperty({ type: InviteActionDataSchema })
  data!: InviteActionDataSchema;
}

export class RemoveOrganizationUserDataSchema {
  @ApiProperty()
  message!: string;

  @ApiProperty()
  userId!: string;

  @ApiProperty()
  email!: string;
}

export class RemoveOrganizationUserResponse extends StandardApiResponse<RemoveOrganizationUserDataSchema> {
  @ApiProperty({ type: RemoveOrganizationUserDataSchema })
  data!: RemoveOrganizationUserDataSchema;
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
  contactEmail!: string | null;

  @ApiProperty({ nullable: true })
  phoneNumber!: string | null;

  @ApiProperty({ nullable: true })
  address!: string | null;

  @ApiProperty({ nullable: true })
  logoUrl!: string | null;

  @ApiProperty({ nullable: true })
  profilePictureUrl!: string | null;

  @ApiProperty({ nullable: true })
  primaryColor!: string | null;

  @ApiProperty({ nullable: true })
  secondaryColor!: string | null;

  @ApiProperty({ nullable: true })
  accentColor!: string | null;

  @ApiProperty({ nullable: true })
  successColor!: string | null;

  @ApiProperty({ nullable: true })
  warningColor!: string | null;

  @ApiProperty({ nullable: true })
  destructiveColor!: string | null;

  @ApiProperty({ nullable: true })
  sidebarBackground!: string | null;

  @ApiProperty({ nullable: true })
  sidebarText!: string | null;

  @ApiProperty({ nullable: true })
  sidebarAccent!: string | null;
}

export class OrganizationDefaultsSchema {
  @ApiProperty()
  timezone!: string;

  @ApiProperty()
  language!: string;

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
