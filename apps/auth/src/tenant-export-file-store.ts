import { Inject, Injectable } from '@nestjs/common';
import { ObjectStorageService } from '@shared/object-storage';

export interface TenantExportFileStore {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer | null>;
}

export const TENANT_EXPORT_FILE_STORE = Symbol('TENANT_EXPORT_FILE_STORE');

@Injectable()
export class InMemoryTenantExportFileStore implements TenantExportFileStore {
  private readonly files = new Map<string, Buffer>();

  async put(key: string, body: Buffer): Promise<void> {
    this.files.set(key, body);
  }

  async get(key: string): Promise<Buffer | null> {
    return this.files.get(key) ?? null;
  }
}

/** Private bucket only. Nothing here is ever given a public or presigned link. */
@Injectable()
export class ObjectStorageTenantExportFileStore implements TenantExportFileStore {
  constructor(@Inject(ObjectStorageService) private readonly storage: ObjectStorageService) {}

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.storage.putObject({ key, body, contentType, visibility: 'private' });
  }

  async get(key: string): Promise<Buffer | null> {
    try {
      return await this.storage.getObject(key, 'private');
    } catch {
      return null;
    }
  }
}
