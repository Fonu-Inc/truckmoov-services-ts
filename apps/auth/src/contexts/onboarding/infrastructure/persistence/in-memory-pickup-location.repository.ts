import { Injectable } from '@nestjs/common';
import type { PickupLocation, PickupLocationRepository } from '@auth/onboarding/domain/pickup-location.repository';

/** The same demo rows the migration seeds. */
const DEMO: PickupLocation[] = [
  { id: 'demo-1', state: 'Lagos', area: 'Ikeja', name: 'MTN Connect Store Ikeja (demo)', address: 'Obafemi Awolowo Way, Ikeja', isDemo: true },
  { id: 'demo-2', state: 'Lagos', area: 'Lekki', name: 'MTN Connect Store Lekki (demo)', address: 'Admiralty Way, Lekki Phase 1', isDemo: true },
  { id: 'demo-4', state: 'FCT', area: 'Wuse', name: 'MTN Connect Store Wuse (demo)', address: 'Aminu Kano Crescent, Wuse 2', isDemo: true },
];

@Injectable()
export class InMemoryPickupLocationRepository implements PickupLocationRepository {
  constructor(private readonly locations: PickupLocation[] = DEMO) {}

  async listActive() {
    return [...this.locations];
  }

  async findActiveById(id: string) {
    return this.locations.find((location) => location.id === id) ?? null;
  }
}
