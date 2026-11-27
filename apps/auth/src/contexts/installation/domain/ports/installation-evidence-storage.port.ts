/** Private storage, not charged to the customer's quota. */
export interface InstallationEvidenceStorage {
  store(key: string, file: { buffer: Buffer; mimeType: string }): Promise<void>;
  downloadUrl(key: string): Promise<string>;
  delete(key: string): Promise<void>;
}

export const INSTALLATION_EVIDENCE_STORAGE = Symbol('INSTALLATION_EVIDENCE_STORAGE');
