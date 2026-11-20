import { describe, expect, it, vi } from 'vitest';
import { GetOnboardingStatusUseCase } from '../../../apps/auth/src/get-onboarding-status.use-case';

const APPLICATION = {
  id: 'app-1',
  reference: 'APP-2026-2A690577',
  status: 'approved',
  stage: 'installation',
  submittedAt: new Date('2026-11-18T09:30:00.000Z'),
  createdAt: new Date('2026-11-17T08:00:00.000Z'),
};

const DEVICE_REQUESTS = [
  { id: 'req-1', quantity: 2, useCase: 'Long haul tracking', notes: null },
  { id: 'req-2', quantity: 1, useCase: 'Trailer tracking', notes: 'Install on the trailer' },
];

const ORDER = {
  orderNumber: 'FL-1002',
  status: 'assigned',
  scheduledDate: new Date('2026-11-20T00:00:00.000Z'),
  timeSlot: 'morning',
};

function useCase(options: { application?: typeof APPLICATION | null } = {}) {
  const tokenService = {
    resolveAccessToken: vi.fn(() => ({ id: 'user-1' })),
  } as never;
  const users = {
    findById: vi.fn(async () => ({
      id: 'user-1',
      tenantId: 'tenant-1',
      role: 'OWNER_OPERATOR',
    })),
  } as never;
  const tenantOnboarding = {
    findByTenantId: vi.fn(async () => ({
      subscriptionActivatedAt: null,
      status: 'payment_pending',
      subscription: { planCode: 'starter' },
    })),
  } as never;
  const applications = {
    findLatestByTenantId: vi.fn(async () => options.application ?? null),
    findVehiclesByApplicationId: vi.fn(async () => [{ id: 'vehicle-1' }]),
    findDeviceRequestsByApplicationId: vi.fn(async () => DEVICE_REQUESTS),
  } as never;
  const orders = {
    findByApplicationId: vi.fn(async () => ORDER),
  } as never;

  return new GetOnboardingStatusUseCase(
    tokenService,
    users,
    tenantOnboarding,
    applications,
    orders,
  );
}

describe('onboarding status device summary', () => {
  it('returns the tenant application, its devices and the installation booking', async () => {
    const result = await useCase({ application: APPLICATION }).execute('Bearer token');

    expect(result.data.application).toMatchObject({
      id: 'app-1',
      reference: 'APP-2026-2A690577',
      status: 'approved',
      stage: 'installation',
      submittedAt: '2026-11-18T09:30:00.000Z',
      vehicleCount: 1,
      requestedDevices: 3,
      deviceRequests: DEVICE_REQUESTS,
      installation: {
        orderNumber: 'FL-1002',
        status: 'assigned',
        scheduledDate: '2026-11-20',
        timeSlot: 'morning',
        timeSlotLabel: 'Morning (8:00 – 12:00)',
      },
    });
  });

  it('answers null when the tenant never had an application', async () => {
    const result = await useCase().execute('Bearer token');

    expect(result.data.application).toBeNull();
  });
});
