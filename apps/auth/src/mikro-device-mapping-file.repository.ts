import { Inject, Injectable } from '@nestjs/common';
import { AppConfigService } from '@shared/config';
import {
  DeviceMappingFileRecord,
  getAuthOrm,
} from './contexts/auth/session/infrastructure/persistence/auth-orm';
import type { DeviceMappingFileRepository, StoredDeviceMappingFile } from './device-mapping-file.repository';

function toStored(r: DeviceMappingFileRecord): StoredDeviceMappingFile {
  return {
    id: r.id,
    tenantId: r.tenantId,
    fileKey: r.fileKey,
    rowCount: r.rowCount,
    errors: r.errors as StoredDeviceMappingFile['errors'],
    createdAt: r.createdAt,
  };
}

@Injectable()
export class MikroDeviceMappingFileRepository implements DeviceMappingFileRepository {
  constructor(@Inject(AppConfigService) private readonly config: AppConfigService) {}

  async findById(id: string): Promise<StoredDeviceMappingFile | null> {
    const orm = await getAuthOrm(this.config.db);
    const em = orm.em.fork();
    const record = await em.findOne(DeviceMappingFileRecord, { id });
    return record ? toStored(record) : null;
  }

  async save(file: StoredDeviceMappingFile): Promise<void> {
    const orm = await getAuthOrm(this.config.db);
    const em = orm.em.fork();
    await em.upsert(DeviceMappingFileRecord, file as unknown as DeviceMappingFileRecord);
  }
}
