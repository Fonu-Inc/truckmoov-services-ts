import { Injectable } from '@nestjs/common';
import type { DeviceMappingFileRepository, StoredDeviceMappingFile } from './device-mapping-file.repository';

@Injectable()
export class InMemoryDeviceMappingFileRepository implements DeviceMappingFileRepository {
  private readonly store = new Map<string, StoredDeviceMappingFile>();

  async findById(id: string): Promise<StoredDeviceMappingFile | null> {
    return this.store.get(id) ?? null;
  }

  async save(file: StoredDeviceMappingFile): Promise<void> {
    this.store.set(file.id, file);
  }
}
