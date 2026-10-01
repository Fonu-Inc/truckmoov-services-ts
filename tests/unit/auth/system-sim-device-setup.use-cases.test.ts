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
import {
  AssignSystemDeviceSetupRequestUseCase,
  DeviceSetupRequestNotReadyError,
} from '../../../apps/auth/src/assign-system-device-setup-request.use-case';
import {
  ConfirmSystemDeviceSetupPaymentUseCase,
  DeviceSetupRequestNotAwaitingPaymentError,
} from '../../../apps/auth/src/confirm-system-device-setup-payment.use-case';
import {
  ApproveSystemDeviceSetupRequestUseCase,
  DeviceSetupRequestAlreadyDecidedError,
  GetSystemDeviceSetupSummaryUseCase,
  RejectSystemDeviceSetupRequestUseCase,
} from '../../../apps/auth/src/decide-system-device-setup-request.use-cases';
import { ForbiddenError } from '../../../apps/auth/src/contexts/auth/session';
import { appendSetupRequestTimeline } from '../../../apps/auth/src/device-setup-request.repository';
import {
  DeviceSetupRequestPricingService,
  DeviceSetupRequestUnpricedError,
} from '../../../apps/auth/src/device-setup-request-pricing.service';
import { DeviceSetupRequestNotFoundError } from '../../../apps/auth/src/get-system-device-setup-request.use-case';
import {
  DeviceSetupRequestNotInProgressError,
  InstallerDeviceSetupRequestsUseCases,
} from '../../../apps/auth/src/installer-device-setup-requests.use-cases';
import { InstallerNotFoundError, InstallerStateError } from '../../../apps/auth/src/contexts/installation/domain/installer';
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
    const useCase = new UpdateSystemSimUseCase(
      systemActor() as never,
      systemUserRepo() as never,
      repo,
      { publish: async () => {} } as never,
    );
    const result = await useCase.execute(TOKEN, 'sim-1', { plan: 'iot_premium', dataLimitMb: 4096 });
    expect(result.data.plan).toBe('iot_premium');
    expect(result.data.dataLimitMb).toBe(4096);
    expect((await repo.findById('sim-1'))!.plan).toBe('iot_premium');
  });

  it('emits sim.changed for a device-linked SIM on update', async () => {
    await repo.save(buildSim({ id: 'sim-1', tenantId: 't1', deviceId: 'dev-9', deviceImei: '359001', status: 'assigned' }));
    const published: Array<{ device_id: string; action: string; tenant_id: string }> = [];
    const useCase = new UpdateSystemSimUseCase(
      systemActor() as never,
      systemUserRepo() as never,
      repo,
      { publish: async (e: never) => { published.push(e); } } as never,
    );
    await useCase.execute(TOKEN, 'sim-1', { carrier: 'Airtel' });
    expect(published).toHaveLength(1);
    expect(published[0].device_id).toBe('dev-9');
    expect(published[0].tenant_id).toBe('t1');
    expect(published[0].action).toBe('updated');
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

const PLAN = { code: 'm2m_standard', name: 'M2M Standard License', perDeviceYear1Ngn: 77_000 };

function pricing(opts: { period?: boolean; customerType?: 'enterprise' | 'owner_operator' } = {}) {
  const period = opts.period === false ? null : { planCode: PLAN.code, applicationId: 'app-1' };
  return new DeviceSetupRequestPricingService(
    { findActiveByTenant: async () => period } as never,
    { facts: async () => ({ customerType: opts.customerType ?? 'enterprise' }) } as never,
    { findByCode: async (code: string) => (code === PLAN.code ? PLAN : null) } as never,
    {
      getAll: async () => ({
        installation_fee_enterprise_ngn: { value: 20_000 },
        installation_fee_owner_operator_ngn: { value: 12_500 },
      }),
    } as never,
  );
}

const INSTALLERS = [
  { id: 'inst-1', userId: 'inst-user-1', code: 'INS-001', status: 'active' },
  { id: 'inst-2', userId: 'inst-user-2', code: 'INS-002', status: 'active' },
  { id: 'inst-3', userId: 'inst-user-3', code: 'INS-003', status: 'suspended' },
];
const installers = {
  findById: async (id: string) => INSTALLERS.find((i) => i.id === id) ?? null,
  findByUserId: async (userId: string) => INSTALLERS.find((i) => i.userId === userId) ?? null,
};
const installerTokens = { resolveAccessToken: (token: string) => ({ id: token }) };

describe('Device setup request charges', () => {
  it('prices quantity × (plan year-1 licence + installation fee) in kobo', async () => {
    const charges = await pricing().chargesFor('tenant-001', 3);
    expect(charges).toEqual({
      currency: 'NGN',
      planCode: 'm2m_standard',
      planName: 'M2M Standard License',
      lines: [
        { kind: 'licence', quantity: 3, unitPriceKobo: 7_700_000, amountKobo: 23_100_000 },
        { kind: 'installation', quantity: 3, unitPriceKobo: 2_000_000, amountKobo: 6_000_000 },
      ],
      totalKobo: 29_100_000,
    });
  });

  it('charges an owner operator the owner operator installation fee', async () => {
    const charges = await pricing({ customerType: 'owner_operator' }).chargesFor('tenant-001', 2);
    expect(charges.lines[1]).toEqual({ kind: 'installation', quantity: 2, unitPriceKobo: 1_250_000, amountKobo: 2_500_000 });
    expect(charges.totalKobo).toBe(2 * 7_700_000 + 2_500_000);
  });

  it('refuses to price a tenant with no active licence plan', async () => {
    await expect(pricing({ period: false }).chargesFor('tenant-001', 1)).rejects.toBeInstanceOf(DeviceSetupRequestUnpricedError);
  });
});

describe('Device setup request mutations', () => {
  function approver(repo: InMemoryDeviceSetupRequestRepository, prices = pricing()) {
    return new ApproveSystemDeviceSetupRequestUseCase(systemActor() as never, systemUserRepo() as never, repo, prices);
  }
  function rejecter(repo: InMemoryDeviceSetupRequestRepository) {
    return new RejectSystemDeviceSetupRequestUseCase(systemActor() as never, systemUserRepo() as never, repo);
  }
  function payment(repo: InMemoryDeviceSetupRequestRepository) {
    return new ConfirmSystemDeviceSetupPaymentUseCase(systemActor() as never, systemUserRepo() as never, repo);
  }
  function assigner(repo: InMemoryDeviceSetupRequestRepository) {
    return new AssignSystemDeviceSetupRequestUseCase(systemActor() as never, systemUserRepo() as never, repo, installers as never);
  }
  function installerPortal(repo: InMemoryDeviceSetupRequestRepository) {
    return new InstallerDeviceSetupRequestsUseCases(installerTokens as never, installers as never, repo);
  }
  function summary(repo: InMemoryDeviceSetupRequestRepository) {
    return new GetSystemDeviceSetupSummaryUseCase(systemActor() as never, systemUserRepo() as never, repo).execute(TOKEN);
  }
  async function awaitingPayment(repo: InMemoryDeviceSetupRequestRepository, id: string) {
    const request = (await repo.findById(id))!;
    await repo.recordDecision({
      id,
      status: 'awaiting_payment',
      decidedBy: 'sys1',
      reason: null,
      charges: null,
      timeline: appendSetupRequestTimeline(request, 'awaiting_payment', null),
    });
  }

  it('approves, stores the charges and auto-approves payment through to ready_for_installation', async () => {
    const repo = new InMemoryDeviceSetupRequestRepository();
    const result = await approver(repo).execute(TOKEN, 'dsr-001', 'Looks good');

    expect(result.data.status).toBe('ready_for_installation');
    expect(result.data.decidedBy).toBe('sys1');
    expect(result.data.decidedAt).not.toBeNull();
    expect(result.data.timeline.map((t) => t.status)).toEqual(['under_review', 'awaiting_payment', 'ready_for_installation']);
    expect(result.data.timeline[1].note).toBe('Looks good · Charges: NGN 97000.00');
    expect(result.data.timeline[2].note).toBe('payment auto-approved');
    expect(result.data.charges).toMatchObject({ currency: 'NGN', totalNgn: 97_000 });
    expect((await repo.findById('dsr-001'))!.charges).toEqual({
      currency: 'NGN',
      planCode: 'm2m_standard',
      planName: 'M2M Standard License',
      lines: [
        { kind: 'licence', quantity: 1, unitPriceKobo: 7_700_000, amountKobo: 7_700_000 },
        { kind: 'installation', quantity: 1, unitPriceKobo: 2_000_000, amountKobo: 2_000_000 },
      ],
      totalKobo: 9_700_000,
    });
  });

  // Approving at nothing would hand out devices for free.
  it('refuses to approve a tenant with no licence plan and leaves the request under review', async () => {
    const repo = new InMemoryDeviceSetupRequestRepository();
    await expect(approver(repo, pricing({ period: false })).execute(TOKEN, 'dsr-001')).rejects.toBeInstanceOf(
      DeviceSetupRequestUnpricedError,
    );
    const request = (await repo.findById('dsr-001'))!;
    expect(request.status).toBe('under_review');
    expect(request.charges).toBeNull();
    expect(request.timeline).toHaveLength(1);
  });

  it('rejects with a reason and no charges', async () => {
    const repo = new InMemoryDeviceSetupRequestRepository();
    const result = await rejecter(repo).execute(TOKEN, 'dsr-001', 'Model is deprecated');
    expect(result.data.status).toBe('rejected');
    expect(result.data.decisionReason).toBe('Model is deprecated');
    expect(result.data.charges).toBeNull();
  });

  // A rejection the tenant cannot act on is not a decision.
  it('refuses a rejection with no reason', async () => {
    const repo = new InMemoryDeviceSetupRequestRepository();
    await expect(rejecter(repo).execute(TOKEN, 'dsr-001', '   ')).rejects.toThrow(/reason/);
  });

  // The tenant has already been told the outcome by the time a second decision
  // is attempted, so the first one stands.
  it('refuses to decide a request twice', async () => {
    const repo = new InMemoryDeviceSetupRequestRepository();
    await approver(repo).execute(TOKEN, 'dsr-001');
    await expect(approver(repo).execute(TOKEN, 'dsr-001')).rejects.toBeInstanceOf(DeviceSetupRequestAlreadyDecidedError);
    await expect(rejecter(repo).execute(TOKEN, 'dsr-001', 'Too late')).rejects.toThrow(/already been decided/);
  });

  it('still confirms payment by hand on a request awaiting payment', async () => {
    const repo = new InMemoryDeviceSetupRequestRepository();
    await awaitingPayment(repo, 'dsr-001');
    const result = await payment(repo).execute(TOKEN, 'dsr-001', ' Transfer ref 991 ');
    expect(result.data.status).toBe('ready_for_installation');
    expect(result.data.timeline.map((t) => t.status)).toEqual(['under_review', 'awaiting_payment', 'ready_for_installation']);
    expect(result.data.timeline.at(-1)?.note).toBe('Transfer ref 991');
  });

  it.each(['dsr-001', 'dsr-002', 'dsr-003'])('refuses to confirm payment on %s, which is not awaiting payment', async (id) => {
    const repo = new InMemoryDeviceSetupRequestRepository();
    await expect(payment(repo).execute(TOKEN, id)).rejects.toBeInstanceOf(DeviceSetupRequestNotAwaitingPaymentError);
  });

  it('refuses a payment confirmation on a request whose payment was auto-approved', async () => {
    const repo = new InMemoryDeviceSetupRequestRepository();
    await approver(repo).execute(TOKEN, 'dsr-001');
    await expect(payment(repo).execute(TOKEN, 'dsr-001')).rejects.toBeInstanceOf(DeviceSetupRequestNotAwaitingPaymentError);
  });

  it('refuses a payment confirmation from a non-system user', async () => {
    const repo = new InMemoryDeviceSetupRequestRepository();
    await awaitingPayment(repo, 'dsr-001');
    const readOnly = new ConfirmSystemDeviceSetupPaymentUseCase(systemActor() as never, systemUserRepo('ENTERPRISE_ADMIN', 't1') as never, repo);
    await expect(readOnly.execute(TOKEN, 'dsr-001')).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('assigns a paid request to an active installer and starts installation', async () => {
    const repo = new InMemoryDeviceSetupRequestRepository();
    await approver(repo).execute(TOKEN, 'dsr-001');
    const result = await assigner(repo).execute(TOKEN, 'dsr-001', 'inst-1');
    expect(result.data.assignedTo).toBe('inst-1');
    expect(result.data.status).toBe('installation_in_progress');
  });

  it('refuses to assign an unknown or inactive installer', async () => {
    const repo = new InMemoryDeviceSetupRequestRepository();
    await approver(repo).execute(TOKEN, 'dsr-001');
    await expect(assigner(repo).execute(TOKEN, 'dsr-001', 'nobody')).rejects.toBeInstanceOf(InstallerNotFoundError);
    await expect(assigner(repo).execute(TOKEN, 'dsr-001', 'inst-3')).rejects.toBeInstanceOf(InstallerStateError);
    expect((await repo.findById('dsr-001'))!.status).toBe('ready_for_installation');
  });

  // Installation waits on both the decision and the payment.
  it('refuses to assign a request still under review or awaiting payment', async () => {
    const repo = new InMemoryDeviceSetupRequestRepository();
    await expect(assigner(repo).execute(TOKEN, 'dsr-001', 'inst-1')).rejects.toThrow(/ready for installation/);
    await awaitingPayment(repo, 'dsr-001');
    await expect(assigner(repo).execute(TOKEN, 'dsr-001', 'inst-1')).rejects.toBeInstanceOf(DeviceSetupRequestNotReadyError);
  });

  it('lets the assigned installer complete the request', async () => {
    const repo = new InMemoryDeviceSetupRequestRepository();
    await approver(repo).execute(TOKEN, 'dsr-001');
    await assigner(repo).execute(TOKEN, 'dsr-001', 'inst-1');

    expect((await installerPortal(repo).list('inst-user-1')).map((r) => r.id)).toEqual(['dsr-001']);
    const completed = await installerPortal(repo).complete('inst-user-1', 'dsr-001');

    expect(completed.status).toBe('completed');
    expect(completed.timeline.at(-1)).toMatchObject({ status: 'completed', note: 'Completed by installer INS-001' });
    expect((await repo.findById('dsr-001'))!.status).toBe('completed');
    await expect(installerPortal(repo).complete('inst-user-1', 'dsr-001')).rejects.toBeInstanceOf(
      DeviceSetupRequestNotInProgressError,
    );
  });

  // Another installer's request answers exactly like a missing one.
  it('refuses an installer completing a request assigned to someone else', async () => {
    const repo = new InMemoryDeviceSetupRequestRepository();
    await approver(repo).execute(TOKEN, 'dsr-001');
    await assigner(repo).execute(TOKEN, 'dsr-001', 'inst-1');

    await expect(installerPortal(repo).complete('inst-user-2', 'dsr-001')).rejects.toBeInstanceOf(DeviceSetupRequestNotFoundError);
    await expect(installerPortal(repo).complete('inst-user-2', 'dsr-002')).rejects.toBeInstanceOf(DeviceSetupRequestNotFoundError);
    await expect(installerPortal(repo).complete('inst-user-2', 'nope')).rejects.toBeInstanceOf(DeviceSetupRequestNotFoundError);
    expect(await installerPortal(repo).list('inst-user-2')).toEqual([]);
    expect((await repo.findById('dsr-001'))!.status).toBe('installation_in_progress');
  });

  it('shuts out a suspended installer', async () => {
    const repo = new InMemoryDeviceSetupRequestRepository();
    await expect(installerPortal(repo).complete('inst-user-3', 'dsr-002')).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('counts devices requested, not requests, on the approval queue cards', async () => {
    const repo = new InMemoryDeviceSetupRequestRepository();
    const { data } = await summary(repo);

    expect(data).toMatchObject({ pendingApproval: 1, awaitingPayment: 0, approved: 2, rejected: 0 });
    // dsr-002 asks for two trackers, the others one each.
    expect(data.devicesRequested).toBe(4);
  });

  it('moves an approved request from pending into the approved bucket, past awaiting payment', async () => {
    const repo = new InMemoryDeviceSetupRequestRepository();
    await approver(repo).execute(TOKEN, 'dsr-001');
    expect((await summary(repo)).data).toMatchObject({ pendingApproval: 0, awaitingPayment: 0, approved: 3 });
  });

  it('counts a request awaiting a manual payment confirmation in both buckets', async () => {
    const repo = new InMemoryDeviceSetupRequestRepository();
    await awaitingPayment(repo, 'dsr-001');
    expect((await summary(repo)).data).toMatchObject({ pendingApproval: 0, awaitingPayment: 1, approved: 3 });

    await payment(repo).execute(TOKEN, 'dsr-001');
    expect((await summary(repo)).data).toMatchObject({ pendingApproval: 0, awaitingPayment: 0, approved: 3 });
  });

  it('filters the queue by the new statuses', async () => {
    const repo = new InMemoryDeviceSetupRequestRepository();
    expect((await repo.findAll({ status: 'under_review' })).map((r) => r.id)).toEqual(['dsr-001']);
    expect((await repo.findAll({ status: 'installation_in_progress' })).map((r) => r.id)).toEqual(['dsr-002']);
    expect((await repo.findAll({ status: 'completed' })).map((r) => r.id)).toEqual(['dsr-003']);
    expect(await repo.findAll({ status: 'pending_review' })).toEqual([]);
  });

  it('searches the queue by DVR reference', async () => {
    const repo = new InMemoryDeviceSetupRequestRepository();
    expect((await repo.findAll({ search: 'dvr-100002' })).map((r) => r.id)).toEqual(['dsr-002']);
  });

  it('filters device setup requests by manufacturer', async () => {
    const repo = new InMemoryDeviceSetupRequestRepository();
    const teltonika = await repo.findAll({ manufacturer: 'Teltonika' });
    expect(teltonika.every((r) => r.manufacturer === 'Teltonika')).toBe(true);
    expect(teltonika.length).toBeGreaterThan(0);
  });
});
