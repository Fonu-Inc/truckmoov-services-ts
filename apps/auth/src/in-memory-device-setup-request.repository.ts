import { Injectable } from '@nestjs/common';
import {
  SETUP_REQUEST_APPROVED_STATUSES,
  SETUP_REQUEST_PENDING_STATUSES,
  type DeviceSetupRequestFilters,
  type DeviceSetupRequestRepository,
  type DeviceSetupRequestStatus,
  type DeviceSetupRequestSummary,
  type StoredDeviceSetupRequest,
} from './device-setup-request.repository';

function seed(
  overrides: Partial<StoredDeviceSetupRequest> & Pick<StoredDeviceSetupRequest, 'id'>,
): StoredDeviceSetupRequest {
  const at = new Date('2026-02-18');
  return {
    tenantId: 'tenant-001',
    organisationName: 'Dangote Logistics',
    requestingEmail: 'fleet@dangote.example',
    manufacturer: 'Teltonika',
    model: 'FMB920',
    trackerType: 'hardwired',
    quantity: 1,
    simRequired: true,
    vehicleId: null,
    state: 'Lagos',
    city: 'Ikeja',
    preferredInstallDate: new Date('2026-03-01'),
    useCase: 'Long-haul GPS tracking',
    notes: null,
    status: 'pending_review',
    kycStatus: 'verified',
    assignedTo: null,
    decidedBy: null,
    decidedAt: null,
    decisionReason: null,
    timeline: [{ status: 'pending_review', at: at.toISOString(), note: null }],
    createdAt: at,
    updatedAt: at,
    ...overrides,
  };
}

const SEED: StoredDeviceSetupRequest[] = [
  seed({ id: 'dsr-001' }),
  seed({
    id: 'dsr-002',
    tenantId: 'tenant-002',
    organisationName: 'Flour Mills Haulage',
    manufacturer: 'Concox',
    model: 'JM-VL01',
    trackerType: 'obd',
    status: 'in_progress',
    quantity: 2,
  }),
  seed({
    id: 'dsr-003',
    tenantId: 'tenant-003',
    organisationName: 'Kano Freight',
    manufacturer: 'Queclink',
    model: 'GV300',
    status: 'assigned',
    assignedTo: 'tech-001',
    kycStatus: 'pending',
  }),
];

@Injectable()
export class InMemoryDeviceSetupRequestRepository implements DeviceSetupRequestRepository {
  private readonly store = new Map<string, StoredDeviceSetupRequest>(
    SEED.map((request) => [request.id, request]),
  );

  async findAll(filters?: DeviceSetupRequestFilters): Promise<StoredDeviceSetupRequest[]> {
    let results = [...this.store.values()];
    if (filters?.status) results = results.filter((r) => r.status === filters.status);
    if (filters?.tenantId) results = results.filter((r) => r.tenantId === filters.tenantId);
    if (filters?.manufacturer) {
      const manufacturer = filters.manufacturer.toLowerCase();
      results = results.filter((r) => r.manufacturer.toLowerCase() === manufacturer);
    }
    if (filters?.dateFrom) {
      const from = new Date(filters.dateFrom).getTime();
      results = results.filter((r) => r.createdAt.getTime() >= from);
    }
    if (filters?.dateTo) {
      const to = new Date(filters.dateTo).getTime();
      results = results.filter((r) => r.createdAt.getTime() <= to);
    }
    if (filters?.search) {
      const query = filters.search.toLowerCase();
      results = results.filter((r) =>
        [r.organisationName, r.requestingEmail, r.manufacturer, r.model, r.tenantId].some(
          (value) => (value ?? '').toLowerCase().includes(query),
        ),
      );
    }
    return results.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  async findById(id: string): Promise<StoredDeviceSetupRequest | null> {
    return this.store.get(id) ?? null;
  }

  async summary(): Promise<DeviceSetupRequestSummary> {
    const all = [...this.store.values()];
    return {
      pendingApproval: all.filter((r) => SETUP_REQUEST_PENDING_STATUSES.includes(r.status)).length,
      approved: all.filter((r) => SETUP_REQUEST_APPROVED_STATUSES.includes(r.status)).length,
      rejected: all.filter((r) => r.status === 'rejected').length,
      devicesRequested: all.reduce((total, r) => total + r.quantity, 0),
    };
  }

  async recordDecision(input: {
    id: string;
    status: DeviceSetupRequestStatus;
    decidedBy: string;
    reason: string | null;
    timeline: Array<{ status: string; at: string; note: string | null }>;
  }): Promise<void> {
    const current = this.store.get(input.id);
    if (!current) return;
    this.store.set(input.id, {
      ...current,
      status: input.status,
      decidedBy: input.decidedBy,
      decidedAt: new Date(),
      decisionReason: input.reason,
      timeline: input.timeline,
      updatedAt: new Date(),
    });
  }

  async assign(id: string, assignedTo: string): Promise<void> {
    const current = this.store.get(id);
    if (!current) return;
    this.store.set(id, {
      ...current,
      assignedTo,
      status: 'in_progress',
      updatedAt: new Date(),
    });
  }
}
