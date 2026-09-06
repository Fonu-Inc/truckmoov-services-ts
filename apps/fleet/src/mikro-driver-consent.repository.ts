import { Inject, Injectable } from "@nestjs/common";
import { AppConfigService } from "@shared/config";
import {
  DriverConsentRecord,
  getFleetOrm,
} from "./contexts/fleet/shared/infrastructure/persistence/fleet-orm";
import type {
  ConsentChannel,
  DriverConsentRepository,
  StoredDriverConsent,
} from "./contexts/fleet/drivers/domain/driver-consent.repository";

function toDomain(record: DriverConsentRecord): StoredDriverConsent {
  return {
    id: record.id,
    tenantId: record.tenantId,
    driverId: record.driverId,
    channel: record.channel as ConsentChannel,
    state: record.state as StoredDriverConsent["state"],
    source: record.source,
    requestedAt: record.requestedAt ?? null,
    respondedAt: record.respondedAt ?? null,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

@Injectable()
export class MikroDriverConsentRepository implements DriverConsentRepository {
  constructor(@Inject(AppConfigService) private readonly config: AppConfigService) {}

  async save(consent: StoredDriverConsent): Promise<void> {
    const em = await this.em();
    const existing = await em.findOne(DriverConsentRecord, {
      tenantId: consent.tenantId,
      driverId: consent.driverId,
      channel: consent.channel,
    });
    const target = existing ?? new DriverConsentRecord();
    Object.assign(target, consent);
    if (!existing) em.persist(target);
    await em.flush();
  }

  async find(
    tenantId: string,
    driverId: string,
    channel: ConsentChannel,
  ): Promise<StoredDriverConsent | null> {
    const em = await this.em();
    const record = await em.findOne(DriverConsentRecord, { tenantId, driverId, channel });
    return record ? toDomain(record) : null;
  }

  async findAllForDriver(tenantId: string, driverId: string): Promise<StoredDriverConsent[]> {
    const em = await this.em();
    const records = await em.find(DriverConsentRecord, { tenantId, driverId });
    return records.map(toDomain);
  }

  async findByPhone(): Promise<StoredDriverConsent[]> {
    // Consent is keyed on the driver, not the number. Inbound replies resolve
    // the driver first and then look consent up by id.
    return [];
  }

  private async em() {
    const orm = await getFleetOrm(this.config.db);
    return orm.em.fork();
  }
}
