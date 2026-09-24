export type InvitedInstaller = { fullName: string };

/**
 * The installer record behind an installer invite. Accepting the invite
 * creates the sign-in, and the record is what links to it.
 */
export interface InstallerAccounts {
  /** The installer waiting on an invite to this address, or null. */
  invited(email: string): Promise<InvitedInstaller | null>;
  /** Links the new sign-in and makes the installer active. */
  activate(email: string, userId: string): Promise<void>;
}

export const INSTALLER_ACCOUNTS = Symbol('INSTALLER_ACCOUNTS');
