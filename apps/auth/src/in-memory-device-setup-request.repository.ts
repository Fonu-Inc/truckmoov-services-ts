import { Injectable } from '@nestjs/common';
import type {
  DeviceSetupRequestFilters,
  DeviceSetupRequestRepository,
  StoredDeviceSetupRequest,
} from './device-setup-request.repository';

const SEED: StoredDeviceSetupRequest[] = [
  {
    id: 'dsr-001',
    imei: '351756051523999',
    manufacturer: 'Teltonika',
    model: 'FMB920',
    connectionType: 'hardwired',
    requesterName: 'Chidi Okonkwo',
    needsSim: true,
    vehiclePlate: 'MAN TGS 18.360 — LG-2847-AK',
    location: 'Ikeja, Lagos',
    tenantId: 'tenant-001',
    status: 'pending_review',
    assignedTo: null,
    notes: null,
    createdAt: new Date('2026-02-18'),
    updatedAt: new Date('2026-02-18'),
  },
  {
    id: 'dsr-002',
    imei: '864285030012345',
    manufacturer: 'Concox',
    model: 'JM-VL01',
    connectionType: 'obd2',
    requesterName: 'Kwame Asante',
    needsSim: true,
    vehiclePlate: 'Volvo FH16 — AC-3399-XY',
    location: 'Tema, Accra',
    tenantId: 'tenant-002',
    status: 'in_progress',
    assignedTo: null,
    notes: null,
    createdAt: new Date('2026-02-18'),
    updatedAt: new Date('2026-02-19'),
  },
  {
    id: 'dsr-003',
    imei: '013476002234567',
    manufacturer: 'Queclink',
    model: 'GV300',
    connectionType: 'hardwired',
    requesterName: 'Amina Bello',
    needsSim: false,
    vehiclePlate: 'DAF XF 480 — KN-5521-GH',
    location: 'Nassarawa, Kano',
    tenantId: 'tenant-003',
    status: 'assigned',
    assignedTo: 'tech-001',
    notes: null,
    createdAt: new Date('2026-02-19'),
    updatedAt: new Date('2026-02-22'),
  },
];

@Injectable()
export class InMemoryDeviceSetupRequestRepository implements DeviceSetupRequestRepository {
  private readonly store = new Map<string, StoredDeviceSetupRequest>(
    SEED.map((r) => [r.id, r]),
  );

  async findAll(filters?: DeviceSetupRequestFilters): Promise<StoredDeviceSetupRequest[]> {
    let results = [...this.store.values()];
    if (filters?.status) results = results.filter((r) => r.status === filters.status);
    if (filters?.tenantId) results = results.filter((r) => r.tenantId === filters.tenantId);
    if (filters?.search) {
      const q = filters.search.toLowerCase();
      results = results.filter(
        (r) =>
          r.imei.includes(q) ||
          r.manufacturer.toLowerCase().includes(q) ||
          r.model.toLowerCase().includes(q) ||
          r.requesterName.toLowerCase().includes(q),
      );
    }
    return results.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async findById(id: string): Promise<StoredDeviceSetupRequest | null> {
    return this.store.get(id) ?? null;
  }

  async save(request: StoredDeviceSetupRequest): Promise<void> {
    this.store.set(request.id, request);
  }
}
