export type UserProfile = {
  fullName: string | null;
  phoneNumber: string | null;
  address: string | null;
  profilePictureUrl: string | null;
};

export type NotificationPreferences = {
  smsAlerts: boolean;
  pushAlerts: boolean;
  incidentAlerts: boolean;
  jobAssignment: boolean;
  jobCompletion: boolean;
  maintenanceReminders: boolean;
  fuelAlerts: boolean;
  geofenceAlerts: boolean;
  emailDigest: boolean;
};

export type DispatcherPreferences = {
  timezone: string;
  shiftStart: string;
  shiftEnd: string;
  workDays: number[];
};

export type StoredUser = {
  id: string;
  email: string;
  passwordHash: string;
  role: string;
  tenantId: string;
  accountStatus?: "enabled" | "disabled";
  /** A role the tenant built; when set it replaces the predefined role's permissions. */
  customRoleId?: string | null;
  emailVerificationToken?: string | null;
  profile?: UserProfile;
  notificationPreferences?: NotificationPreferences;
  dispatcherPreferences?: DispatcherPreferences;
};

export function defaultUserProfile(): UserProfile {
  return {
    fullName: null,
    phoneNumber: null,
    address: null,
    profilePictureUrl: null,
  };
}

export function defaultNotificationPreferences(): NotificationPreferences {
  return {
    smsAlerts: false,
    pushAlerts: true,
    incidentAlerts: true,
    jobAssignment: true,
    jobCompletion: true,
    maintenanceReminders: true,
    fuelAlerts: true,
    geofenceAlerts: true,
    emailDigest: false,
  };
}

export function defaultDispatcherPreferences(): DispatcherPreferences {
  return {
    timezone: "UTC",
    shiftStart: "09:00",
    shiftEnd: "17:00",
    workDays: [1, 2, 3, 4, 5],
  };
}

export function normalizeStoredUser(user: StoredUser): StoredUser {
  const raw = user.notificationPreferences as Record<string, unknown> | undefined;
  let prefs: NotificationPreferences;
  if (!raw) {
    prefs = defaultNotificationPreferences();
  } else {
    prefs = {
      smsAlerts: (raw.smsAlerts as boolean) ?? false,
      pushAlerts: (raw.pushAlerts as boolean) ?? true,
      incidentAlerts: (raw.incidentAlerts as boolean) ?? true,
      jobAssignment: (raw.jobAssignment as boolean) ?? (raw.jobUpdates as boolean) ?? true,
      jobCompletion: (raw.jobCompletion as boolean) ?? (raw.jobUpdates as boolean) ?? true,
      maintenanceReminders: (raw.maintenanceReminders as boolean) ?? true,
      fuelAlerts: (raw.fuelAlerts as boolean) ?? true,
      geofenceAlerts: (raw.geofenceAlerts as boolean) ?? true,
      emailDigest: (raw.emailDigest as boolean) ?? (raw.emailAlerts as boolean) ?? false,
    };
  }
  return {
    ...user,
    accountStatus: user.accountStatus ?? "enabled",
    profile: { ...defaultUserProfile(), ...(user.profile ?? {}) },
    notificationPreferences: prefs,
    dispatcherPreferences:
      user.dispatcherPreferences ?? defaultDispatcherPreferences(),
  };
}

export interface UserRepository {
  findByEmail(email: string): Promise<StoredUser | null>;
  findById(id: string): Promise<StoredUser | null>;
  findAll(): Promise<StoredUser[]>;
  findAllByTenant(tenantId: string): Promise<StoredUser[]>;
  findByRoles(roles: readonly string[]): Promise<StoredUser[]>;
  findAllByTenantFiltered(
    tenantId: string,
    filters: { search?: string; role?: string; accountStatus?: string },
  ): Promise<StoredUser[]>;
  findByVerificationToken(token: string): Promise<StoredUser | null>;
  save(user: StoredUser): Promise<void>;
  updateRole(userId: string, role: string): Promise<void>;
  updateCustomRole(userId: string, customRoleId: string | null): Promise<void>;
  updatePassword(userId: string, passwordHash: string): Promise<void>;
  updateProfile(userId: string, profile: UserProfile): Promise<void>;
  updateAccountStatus(
    userId: string,
    accountStatus: "enabled" | "disabled",
  ): Promise<void>;
  deleteById(userId: string): Promise<void>;
  updateNotificationPreferences(
    userId: string,
    preferences: NotificationPreferences,
  ): Promise<void>;
  updateDispatcherPreferences(
    userId: string,
    preferences: DispatcherPreferences,
  ): Promise<void>;
}

export const USER_REPOSITORY = Symbol("USER_REPOSITORY");
