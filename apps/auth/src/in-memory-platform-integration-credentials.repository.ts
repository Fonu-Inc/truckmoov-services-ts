import { Injectable } from '@nestjs/common';
import type {
  PlatformIntegrationCredentialsRepository,
  StoredPlatformIntegrationCredential,
} from './platform-integration-credentials.repository';

@Injectable()
export class InMemoryPlatformIntegrationCredentialsRepository
  implements PlatformIntegrationCredentialsRepository
{
  private readonly values = new Map<string, StoredPlatformIntegrationCredential>();

  async list(): Promise<StoredPlatformIntegrationCredential[]> {
    return [...this.values.values()].map((value) => structuredClone(value));
  }

  async findByServiceKey(serviceKey: string): Promise<StoredPlatformIntegrationCredential | null> {
    const value = this.values.get(serviceKey);
    return value ? structuredClone(value) : null;
  }

  async save(value: StoredPlatformIntegrationCredential): Promise<void> {
    this.values.set(value.serviceKey, structuredClone(value));
  }
}
