import { Injectable } from "@nestjs/common";
import type {
  ConsentChannel,
  DriverConsentRepository,
  StoredDriverConsent,
} from "./contexts/fleet/drivers/domain/driver-consent.repository";

@Injectable()
export class InMemoryDriverConsentRepository implements DriverConsentRepository {
  private readonly consents = new Map<string, StoredDriverConsent>();

  private key(tenantId: string, driverId: string, channel: ConsentChannel): string {
    return `${tenantId}:${driverId}:${channel}`;
  }

  async save(consent: StoredDriverConsent): Promise<void> {
    this.consents.set(this.key(consent.tenantId, consent.driverId, consent.channel), { ...consent });
  }

  async find(
    tenantId: string,
    driverId: string,
    channel: ConsentChannel,
  ): Promise<StoredDriverConsent | null> {
    return this.consents.get(this.key(tenantId, driverId, channel)) ?? null;
  }

  async findAllForDriver(tenantId: string, driverId: string): Promise<StoredDriverConsent[]> {
    return [...this.consents.values()].filter(
      (consent) => consent.tenantId === tenantId && consent.driverId === driverId,
    );
  }

  async findByPhone(): Promise<StoredDriverConsent[]> {
    return [];
  }
}
