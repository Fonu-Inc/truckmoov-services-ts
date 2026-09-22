export type StoredInstaller = {
  id: string;
  fullName: string;
  email: string;
  phoneNumber: string;
  team: string;
  /** Where they work, so an assignment rule can eventually use it. */
  state: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export interface InstallerRepository {
  save(installer: StoredInstaller): Promise<void>;
  findById(id: string): Promise<StoredInstaller | null>;
  findActive(): Promise<StoredInstaller[]>;
  /** Active installers working the given state, nearest fit first. */
  findActiveInState(state: string): Promise<StoredInstaller[]>;
}

export const INSTALLER_REPOSITORY = Symbol('INSTALLER_REPOSITORY');
