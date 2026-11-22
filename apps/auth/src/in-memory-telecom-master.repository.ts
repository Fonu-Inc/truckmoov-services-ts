import { Injectable } from '@nestjs/common';
import type {
  StoredTelecomMasterEvent,
  StoredTelecomMasterRequest,
  TelecomMasterRepository,
} from './telecom-master.repository';

@Injectable()
export class InMemoryTelecomMasterRepository implements TelecomMasterRepository {
  private readonly requests = new Map<string, StoredTelecomMasterRequest>();
  private readonly events = new Map<string, StoredTelecomMasterEvent>();

  async findAll(): Promise<StoredTelecomMasterRequest[]> {
    return [...this.requests.values()].sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
    );
  }

  async findById(id: string): Promise<StoredTelecomMasterRequest | null> {
    return this.requests.get(id) ?? null;
  }

  async findLatestForTenant(tenantId: string): Promise<StoredTelecomMasterRequest | null> {
    return (await this.findAll()).find((r) => r.tenantId === tenantId) ?? null;
  }

  async isMsisdnTaken(msisdn: string, exceptRequestId?: string): Promise<boolean> {
    return [...this.requests.values()].some(
      (r) => r.msisdn === msisdn && r.id !== exceptRequestId && !r.status.endsWith('_failed'),
    );
  }

  readonly deviceSimMsisdns = new Set<string>();

  async isDeviceSimMsisdn(msisdn: string): Promise<boolean> {
    return this.deviceSimMsisdns.has(msisdn.slice(-10));
  }

  async save(request: StoredTelecomMasterRequest): Promise<void> {
    this.requests.set(request.id, { ...request });
  }

  async findEvents(requestId: string): Promise<StoredTelecomMasterEvent[]> {
    return [...this.events.values()]
      .filter((event) => event.requestId === requestId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  async appendEvent(event: StoredTelecomMasterEvent): Promise<void> {
    this.events.set(event.id, { ...event });
  }
}
