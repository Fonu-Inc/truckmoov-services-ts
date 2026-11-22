import { Inject, Injectable } from '@nestjs/common';
import { AppConfigService } from '@shared/config';
import {
  getAuthOrm,
  TelecomMasterEventRecord,
  TelecomMasterRequestRecord,
} from './contexts/auth/session/infrastructure/persistence/auth-orm';
import type {
  StoredTelecomMasterEvent,
  StoredTelecomMasterRequest,
  TelecomMasterNumberType,
  TelecomMasterRepository,
  TelecomMasterStatus,
} from './telecom-master.repository';

function toStoredRequest(r: TelecomMasterRequestRecord): StoredTelecomMasterRequest {
  return {
    id: r.id,
    tenantId: r.tenantId,
    organizationName: r.organizationName,
    contactEmail: r.contactEmail,
    applicationId: r.applicationId,
    applicationReference: r.applicationReference,
    msisdn: r.msisdn,
    simSerial: r.simSerial,
    numberType: r.numberType as TelecomMasterNumberType,
    status: r.status as TelecomMasterStatus,
    mtnReference: r.mtnReference,
    failureReason: r.failureReason,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

function toStoredEvent(e: TelecomMasterEventRecord): StoredTelecomMasterEvent {
  return {
    id: e.id,
    requestId: e.requestId,
    action: e.action,
    detail: e.detail,
    createdAt: e.createdAt,
  };
}

@Injectable()
export class MikroTelecomMasterRepository implements TelecomMasterRepository {
  constructor(@Inject(AppConfigService) private readonly config: AppConfigService) {}

  async findAll(): Promise<StoredTelecomMasterRequest[]> {
    const orm = await getAuthOrm(this.config.db);
    const records = await orm.em.fork().find(
      TelecomMasterRequestRecord,
      {},
      { orderBy: { createdAt: 'desc' } },
    );
    return records.map(toStoredRequest);
  }

  async findById(id: string): Promise<StoredTelecomMasterRequest | null> {
    const orm = await getAuthOrm(this.config.db);
    const record = await orm.em.fork().findOne(TelecomMasterRequestRecord, { id });
    return record ? toStoredRequest(record) : null;
  }

  async save(request: StoredTelecomMasterRequest): Promise<void> {
    const orm = await getAuthOrm(this.config.db);
    const em = orm.em.fork();
    await em.upsert(TelecomMasterRequestRecord, request as unknown as TelecomMasterRequestRecord);
    em.clear();
  }

  async findEvents(requestId: string): Promise<StoredTelecomMasterEvent[]> {
    const orm = await getAuthOrm(this.config.db);
    const records = await orm.em.fork().find(
      TelecomMasterEventRecord,
      { requestId },
      { orderBy: { createdAt: 'asc' } },
    );
    return records.map(toStoredEvent);
  }

  async appendEvent(event: StoredTelecomMasterEvent): Promise<void> {
    const orm = await getAuthOrm(this.config.db);
    const em = orm.em.fork();
    await em.upsert(TelecomMasterEventRecord, event as unknown as TelecomMasterEventRecord);
    em.clear();
  }
}
