import { Inject, Injectable } from '@nestjs/common';
import { AppConfigService } from '@shared/config';
import { getAuthOrm, PlatformIntegrationCredentialRecord } from './contexts/auth/session/infrastructure/persistence/auth-orm';
import { PlatformIntegrationCredentialStorageError, type PlatformIntegrationCredentialsRepository, type StoredPlatformIntegrationCredential } from './platform-integration-credentials.repository';

function map(record: PlatformIntegrationCredentialRecord): StoredPlatformIntegrationCredential {
  return {
    serviceKey: record.serviceKey,
    category: record.category,
    enabled: record.enabled,
    secretCiphertext: record.secretCiphertext,
    secretPreview: record.secretPreview,
    config: record.config ?? {},
    status: record.status as StoredPlatformIntegrationCredential['status'],
    lastTestedAt: record.lastTestedAt?.toISOString() ?? null,
    lastError: record.lastError,
    updatedAt: record.updatedAt.toISOString(),
  };
}

@Injectable()
export class MikroPlatformIntegrationCredentialsRepository implements PlatformIntegrationCredentialsRepository {
  constructor(@Inject(AppConfigService) private readonly config: AppConfigService) {}

  async list(): Promise<StoredPlatformIntegrationCredential[]> {
    try {
      const orm = await getAuthOrm(this.config.db);
      return (await orm.em.fork().find(PlatformIntegrationCredentialRecord, {}, { orderBy: { serviceKey: 'asc' } })).map(map);
    } catch (error) {
      throw new PlatformIntegrationCredentialStorageError('list', error);
    }
  }

  async findByServiceKey(serviceKey: string): Promise<StoredPlatformIntegrationCredential | null> {
    try {
      const orm = await getAuthOrm(this.config.db);
      const record = await orm.em.fork().findOne(PlatformIntegrationCredentialRecord, { serviceKey });
      return record ? map(record) : null;
    } catch (error) {
      throw new PlatformIntegrationCredentialStorageError('find', error);
    }
  }

  async save(value: StoredPlatformIntegrationCredential): Promise<void> {
    try {
      const orm = await getAuthOrm(this.config.db);
      await orm.em.fork().upsert(PlatformIntegrationCredentialRecord, {
        serviceKey: value.serviceKey,
        category: value.category,
        enabled: value.enabled,
        secretCiphertext: value.secretCiphertext,
        secretPreview: value.secretPreview,
        config: value.config,
        status: value.status,
        lastTestedAt: value.lastTestedAt ? new Date(value.lastTestedAt) : null,
        lastError: value.lastError,
        updatedAt: new Date(value.updatedAt),
      });
    } catch (error) {
      throw new PlatformIntegrationCredentialStorageError('save', error);
    }
  }
}
