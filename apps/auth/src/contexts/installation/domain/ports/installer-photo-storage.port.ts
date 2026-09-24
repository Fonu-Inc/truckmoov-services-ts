/** Where installer profile photos live: private storage, read through short-lived links. */
export interface InstallerPhotoStorage {
  store(installerId: string, photo: { buffer: Buffer; mimeType: string; extension: string }): Promise<string>;
  remove(key: string): Promise<void>;
  /** Null when no link can be made; a missing photo is not an error on any screen. */
  url(key: string | null): Promise<string | null>;
}

export const INSTALLER_PHOTO_STORAGE = Symbol('INSTALLER_PHOTO_STORAGE');
