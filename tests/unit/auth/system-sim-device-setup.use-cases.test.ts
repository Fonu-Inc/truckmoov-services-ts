import { describe, expect, it, beforeEach } from 'vitest';
import { InMemorySimRepository } from '../../../apps/auth/src/in-memory-sim.repository';
import { InMemorySimActivationBatchRepository } from '../../../apps/auth/src/in-memory-sim-activation-batch.repository';
import { InMemorySimProvisioningRequestRepository } from '../../../apps/auth/src/in-memory-sim-provisioning-request.repository';
import { InMemoryDeviceSetupRequestRepository } from '../../../apps/auth/src/in-memory-device-setup-request.repository';
import {
  GetSystemSimDetailUseCase,
  SimNotFoundError,
} from '../../../apps/auth/src/get-system-sim-detail.use-case';
import { UpdateSystemSimUseCase } from '../../../apps/auth/src/update-system-sim.use-case';
import { ReassignSystemSimUseCase } from '../../../apps/auth/src/reassign-system-sim.use-case';
import { SuspendSystemSimUseCase } from '../../../apps/auth/src/suspend-system-sim.use-case';
import { GetSystemSimBatchesSummaryUseCase } from '../../../apps/auth/src/get-system-sim-batches-summary.use-case';
import {
  RetrySystemSimBatchUseCase,
  SimBatchNotRetryableError,
} from '../../../apps/auth/src/retry-system-sim-batch.use-case';
import { GetSystemSimRequestsSummaryUseCase } from '../../../apps/auth/src/get-system-sim-requests-summary.use-case';
import { AssignSystemDeviceSetupRequestUseCase } from '../../../apps/auth/src/assign-system-device-setup-request.use-case';
import { RejectSystemDeviceSetupRequestUseCase } from '../../../apps/auth/src/reject-system-device-setup-request.use-case';
import { ForbiddenError } from '../../../apps/auth/src/contexts/auth/session';
import type { StoredSim } from '../../../apps/auth/src/sim.repository';
import type { StoredSimActivationBatch } from '../../../apps/auth/src/sim-activation-batch.repository';
import type { StoredSimProvisioningRequest } from '../../../apps/auth/src/sim-provisioning-request.repository';

const TOKEN = 'sys-token';

function systemActor() {
  return {
    resolveAccessToken: () => ({ id: 'sys1' }) as never,
  };
}

function systemUserRepo(role = 'SYSTEM_ADMIN', tenantId = 'system') {
  return {
    findById: async () => ({
      id: 'sys1',
      email: 'admin@system',
      passwordHash: 'x',
      role,
      tenantId,
      accountStatus: 'enabled',
    }),
  };
}

function buildSim(overrides: Partial<StoredSim> = {}): StoredSim {
  return {
    id: 'sim-1',
    iccid: '8923400000000000001',
    imsi: null,
    msisdn: null,
    carrier: 'MTN',
    plan: 'iot_basic',
    status: 'active',
    tenantId: null,
    deviceId: null,
    dataUsageMb: 0,
    dataLimitMb: 1024,
    smsUsage: 0,
    smsLimit: 100,
    monthlyCostNgn: 0,
    activationDate: null,
    expiryDate: null,
    lastActivity: null,
    signalStrength: null,
    networkType: null,
    roaming: false,
    fonuSimId: null,
    fonuStatus: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  };
}

describe('SIM per-row action use-cases', () => {
  let repo: InMemorySimRepository;
  beforeEach(async () => {
    repo = new InMemorySimRepository();
    await repo.save(buildSim());
  });

  it('returns SIM detail', async () => {
    const useCase = new GetSystemSimDetailUseCase(systemActor() as never, systemUserRepo() as never, repo);
    const result = await useCase.execute(TOKEN, 'sim-1');
    expect(result.data.id).toBe('sim-1');
  });

  it('throws SimNotFoundError for unknown id', async () => {
    const useCase = new GetSystemSimDetailUseCase(systemActor() as never, systemUserRepo() as never, repo);
    await expect(useCase.execute(TOKEN, 'nope')).rejects.toBeInstanceOf(SimNotFoundError);
  });

  it('forbids non-system actors', async () => {
    const useCase = new GetSystemSimDetailUseCase(systemActor() as never, systemUserRepo('ENTERPRISE_ADMIN', 't1') as never, repo);
    await expect(useCase.execute(TOKEN, 'sim-1')).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('updates editable fields only', async () => {
    const useCase = new UpdateSystemSimUseCase(systemActor() as never, systemUserRepo() as never, repo);
    const result = await useCase.execute(TOKEN, 'sim-1', { plan: 'iot_premium', dataLimitMb: 4096 });
    expect(result.data.plan).toBe('iot_premium');
    expect(result.data.dataLimitMb).toBe(4096);
    expect((await repo.findById('sim-1'))!.plan).toBe('iot_premium');
  });

  it('reassigns to a tenant and marks assigned', async () => {
    const useCase = new ReassignSystemSimUseCase(systemActor() as never, systemUserRepo() as never, repo);
    const result = await useCase.execute(TOKEN, 'sim-1', { tenantId: 'tenant-9', deviceId: 'dev-9' });
    expect(result.data.tenantId).toBe('tenant-9');
    expect(result.data.status).toBe('assigned');
  });

  it('returns SIM to the pool when tenant cleared', async () => {
    await repo.save(buildSim({ id: 'sim-2', tenantId: 'tenant-1', deviceId: 'd', status: 'assigned' }));
    const useCase = new ReassignSystemSimUseCase(systemActor() as never, systemUserRepo() as never, repo);
    const result = await useCase.execute(TOKEN, 'sim-2', { tenantId: null });
    expect(result.data.tenantId).toBeNull();
    expect(result.data.deviceId).toBeNull();
    expect(result.data.status).toBe('registered');
  });

  it('toggles suspension', async () => {
    const useCase = new SuspendSystemSimUseCase(systemActor() as never, systemUserRepo() as never, repo);
    const suspended = await useCase.execute(TOKEN, 'sim-1');
    expect(suspended.data.status).toBe('suspended');
    const reactivated = await useCase.execute(TOKEN, 'sim-1');
    expect(reactivated.data.status).toBe('active');
  });
});

describe('SIM batch use-cases', () => {
  function buildBatch(overrides: Partial<StoredSimActivationBatch> = {}): StoredSimActivationBatch {
    return {
      id: 'batch-1',
      requestId: null,
      tenantId: 't1',
      tenantName: 'Tenant 1',
      activationMode: 'bulk',
      quantity: 5,
      operator: 'MTN Nigeria',
      requestedPlan: 'iot_basic',
      dataLimitGb: 1,
      deviceMappingData: null,
      status: 'pending',
      simsActivated: 0,
      simsFailed: 0,
      fonuResponse: null,
      createdBy: null,
      createdByName: null,
      startedAt: null,
      completedAt: null,
      errorMessage: null,
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-01'),
      ...overrides,
    };
  }

  it('summarizes batches', async () => {
    const repo = new InMemorySimActivationBatchRepository();
    await repo.save(buildBatch({ id: 'b1', status: 'pending', quantity: 5 }));
    await repo.save(buildBatch({ id: 'b2', status: 'failed', quantity: 3 }));
    await repo.save(buildBatch({ id: 'b3', status: 'completed', quantity: 10 }));
    const useCase = new GetSystemSimBatchesSummaryUseCase(systemActor() as never, systemUserRepo() as never, repo);
    const result = await useCase.execute(TOKEN);
    expect(result.data.pendingActivation).toBe(1);
    expect(result.data.needsAttention).toBe(1);
    expect(result.data.totalSimsQueued).toBe(8); // excludes completed
  });

  it('retries a failed batch and rejects a pending one', async () => {
    const repo = new InMemorySimActivationBatchRepository();
    await repo.save(buildBatch({ id: 'failed', status: 'failed', simsFailed: 5 }));
    await repo.save(buildBatch({ id: 'pending', status: 'pending' }));
    const useCase = new RetrySystemSimBatchUseCase(systemActor() as never, systemUserRepo() as never, repo);
    const result = await useCase.execute(TOKEN, 'failed');
    expect(result.data.batchId).toBe('failed');
    expect((await repo.findById('failed'))!.status).toBe('pending');
    await expect(useCase.execute(TOKEN, 'pending')).rejects.toBeInstanceOf(SimBatchNotRetryableError);
  });
});

describe('SIM requests summary', () => {
  function buildReq(overrides: Partial<StoredSimProvisioningRequest> = {}): StoredSimProvisioningRequest {
    return {
      id: 'r1',
      tenantId: 't1',
      tenantName: 'Tenant 1',
      requestType: 'activation',
      numberOfSims: 5,
      preferredOperator: 'MTN Nigeria',
      requestedPlan: 'iot_basic',
      requestedDataLimitMb: 1024,
      deploymentTimeline: null,
      useCase: null,
      deviceMappingData: null,
      status: 'pending',
      approvedBy: null,
      approvedByName: null,
      approvedAt: null,
      rejectedReason: null,
      fonuRequestId: null,
      fonuResponse: null,
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-01'),
      ...overrides,
    };
  }

  it('counts requests by state', async () => {
    const repo = new InMemorySimProvisioningRequestRepository();
    await repo.save(buildReq({ id: 'r1', status: 'pending' }));
    await repo.save(buildReq({ id: 'r2', status: 'approved', approvedAt: new Date() }));
    const useCase = new GetSystemSimRequestsSummaryUseCase(systemActor() as never, systemUserRepo() as never, repo);
    const result = await useCase.execute(TOKEN);
    expect(result.data.totalRequested).toBe(2);
    expect(result.data.pendingApproval).toBe(1);
    expect(result.data.approvedThisMonth).toBe(1);
  });

  it('filters requests by carrier and organisation', async () => {
    const repo = new InMemorySimProvisioningRequestRepository();
    await repo.save(buildReq({ id: 'r1', preferredOperator: 'MTN Nigeria', tenantName: 'Alpha' }));
    await repo.save(buildReq({ id: 'r2', preferredOperator: 'Airtel Nigeria', tenantName: 'Beta' }));
    expect((await repo.findAll({ carrier: 'MTN Nigeria' })).map((r) => r.id)).toEqual(['r1']);
    expect((await repo.findAll({ organisation: 'beta' })).map((r) => r.id)).toEqual(['r2']);
  });
});

describe('Device setup request mutations', () => {
  it('assigns to the acting system user', async () => {
    const repo = new InMemoryDeviceSetupRequestRepository();
    const useCase = new AssignSystemDeviceSetupRequestUseCase(systemActor() as never, systemUserRepo() as never, repo);
    const result = await useCase.execute(TOKEN, 'dsr-001');
    expect(result.data.assignedTo).toBe('sys1');
    expect(result.data.status).toBe('in_progress');
  });

  it('rejects with a reason', async () => {
    const repo = new InMemoryDeviceSetupRequestRepository();
    const useCase = new RejectSystemDeviceSetupRequestUseCase(systemActor() as never, systemUserRepo() as never, repo);
    const result = await useCase.execute(TOKEN, 'dsr-001', 'Invalid IMEI');
    expect(result.data.status).toBe('rejected');
    expect(result.data.rejectedReason).toBe('Invalid IMEI');
  });

  it('filters device setup requests by manufacturer', async () => {
    const repo = new InMemoryDeviceSetupRequestRepository();
    const teltonika = await repo.findAll({ manufacturer: 'Teltonika' });
    expect(teltonika.every((r) => r.manufacturer === 'Teltonika')).toBe(true);
    expect(teltonika.length).toBeGreaterThan(0);
  });
});
