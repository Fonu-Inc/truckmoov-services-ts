import { Injectable } from '@nestjs/common';
import type {
  FieldActivityEvent,
  TenantFieldActivityReader,
  TenantUsageCounts,
} from '../../domain/tenant-field-activity.reader';

@Injectable()
export class InMemoryTenantFieldActivityReader implements TenantFieldActivityReader {
  async list(): Promise<FieldActivityEvent[]> {
    return [];
  }

  async usageCounts(): Promise<TenantUsageCounts | null> {
    return null;
  }
}
