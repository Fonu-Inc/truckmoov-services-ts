export type UserProfile = {
  fullName: string | null;
  phoneNumber: string | null;
};

export type NotificationPreferences = {
  emailAlerts: boolean;
  smsAlerts: boolean;
  pushAlerts: boolean;
  incidentAlerts: boolean;
  jobUpdates: boolean;
  marketingAnnouncements: boolean;
};

export type DispatcherPreferences = {
  timezone: string;
  shiftStart: string;
  shiftEnd: string;
  workDays: number[];
};

export type StoredUser = {
  id: string;
  username: string;
  passwordHash: string;
  roles: string[];
  tenantId: string;
  profile?: UserProfile;
  notificationPreferences?: NotificationPreferences;
  dispatcherPreferences?: DispatcherPreferences;
};

export function defaultUserProfile(): UserProfile {
  return {
    fullName: null,
    phoneNumber: null,
  };
}

export function defaultNotificationPreferences(): NotificationPreferences {
  return {
    emailAlerts: true,
    smsAlerts: false,
    pushAlerts: true,
    incidentAlerts: true,
    jobUpdates: true,
    marketingAnnouncements: false,
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
  return {
    ...user,
    profile: user.profile ?? defaultUserProfile(),
    notificationPreferences:
      user.notificationPreferences ?? defaultNotificationPreferences(),
    dispatcherPreferences:
      user.dispatcherPreferences ?? defaultDispatcherPreferences(),
  };
}

export interface UserRepository {
  findByUsername(username: string): Promise<StoredUser | null>;
  findById(id: string): Promise<StoredUser | null>;
  save(user: StoredUser): Promise<void>;
  updateRoles(userId: string, roles: string[]): Promise<void>;
  updatePassword(userId: string, passwordHash: string): Promise<void>;
  updateProfile(userId: string, profile: UserProfile): Promise<void>;
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
