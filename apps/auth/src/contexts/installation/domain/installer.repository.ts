import type {
  InstallerCapability,
  InstallerNotificationPreferences,
  InstallerStatus,
} from './installer';
import type { InstallerDisplayPreferences, InstallerWorkPreferences } from './installer-preferences';

export type StoredInstaller = {
  id: string;
  /** The installer's own sign-in, set when the invite is accepted. */
  userId: string | null;
  code: string;
  firstName: string;
  lastName: string;
  /** Always firstName and lastName joined; kept for the customer screens. */
  fullName: string;
  email: string;
  phoneNumber: string;
  team: string;
  state: string | null;
  city: string | null;
  /** The states they work in; assignment matches on these. */
  serviceAreas: string[];
  capabilities: InstallerCapability[];
  photoKey: string | null;
  notificationPreferences: InstallerNotificationPreferences | null;
  displayPreferences: InstallerDisplayPreferences | null;
  /** The installer's own availability, working hours and days; null until first saved. */
  workPreferences: InstallerWorkPreferences | null;
  status: InstallerStatus;
  maxActiveJobs: number;
  lastActivityAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type InstallerFilters = { search?: string; status?: InstallerStatus };
export type InstallerPageRequest = { page: number; limit: number };
export type InstallerPage = { items: StoredInstaller[]; total: number };

export interface InstallerRepository {
  save(installer: StoredInstaller): Promise<void>;
  findById(id: string): Promise<StoredInstaller | null>;
  findByEmail(email: string): Promise<StoredInstaller | null>;
  findByUserId(userId: string): Promise<StoredInstaller | null>;
  findActive(): Promise<StoredInstaller[]>;
  /** Newest first; search covers name, code, email and service areas. */
  list(filters: InstallerFilters, page: InstallerPageRequest): Promise<InstallerPage>;
  countByStatus(): Promise<Record<InstallerStatus, number>>;
  nextCode(): Promise<string>;
}

export const INSTALLER_REPOSITORY = Symbol('INSTALLER_REPOSITORY');
