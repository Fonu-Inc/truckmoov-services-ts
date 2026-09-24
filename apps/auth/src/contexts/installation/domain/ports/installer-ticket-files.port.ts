/** Private storage for installer ticket attachments, not charged to any customer's quota. */
export interface InstallerTicketFiles {
  store(key: string, file: { buffer: Buffer; mimeType: string }): Promise<void>;
  remove(key: string): Promise<void>;
  downloadUrl(key: string): Promise<string>;
}

export const INSTALLER_TICKET_FILES = Symbol('INSTALLER_TICKET_FILES');
