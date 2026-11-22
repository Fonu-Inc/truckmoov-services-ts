import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { TOKEN_SERVICE, USER_REPOSITORY, ForbiddenError } from './contexts/auth/session';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import { ensureSystemActor, SYSTEM_MUTATOR_ROLES } from './system-authz';
import {
  SIM_PROVISIONING_REQUEST_REPOSITORY,
  type SimProvisioningRequestRepository,
} from './sim-provisioning-request.repository';
import {
  SIM_ACTIVATION_BATCH_REPOSITORY,
  type SimActivationBatchRepository,
} from './sim-activation-batch.repository';

export class SimRequestNotFoundError extends Error {
  constructor(id: string) {
    super(`SIM provisioning request ${id} not found`);
  }
}

export class SimRequestAlreadyProcessedError extends Error {
  constructor(id: string, status: string) {
    super(`SIM provisioning request ${id} is already ${status}`);
  }
}

@Injectable()
export class ApproveSystemSimRequestUseCase {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(SIM_PROVISIONING_REQUEST_REPOSITORY)
    private readonly requestRepo: SimProvisioningRequestRepository,
    @Inject(SIM_ACTIVATION_BATCH_REPOSITORY)
    private readonly batchRepo: SimActivationBatchRepository,
  ) {}

  async execute(accessToken: string, requestId: string) {
    const actor = await ensureSystemActor(
      accessToken,
      this.tokenService,
      this.userRepository,
      {
        allowedRoles: SYSTEM_MUTATOR_ROLES,
        forbiddenMessage: 'You are not permitted to approve SIM requests',
      },
    );

    const request = await this.requestRepo.findById(requestId);
    if (!request) throw new SimRequestNotFoundError(requestId);
    if (request.status !== 'pending')
      throw new SimRequestAlreadyProcessedError(requestId, request.status);

    const now = new Date();
    request.status = 'approved';
    request.approvedBy = actor.id;
    request.approvedByName = actor.email;
    request.approvedAt = now;
    request.updatedAt = now;
    await this.requestRepo.save(request);

    const batchId = randomUUID();
    const batch = {
      id: batchId,
      requestId: request.id,
      tenantId: request.tenantId,
      tenantName: request.tenantName,
      activationMode: request.numberOfSims === 1 ? 'single' : 'bulk',
      quantity: request.numberOfSims,
      operator: request.preferredOperator,
      requestedPlan: request.requestedPlan,
      dataLimitGb: request.requestedDataLimitMb / 1024,
      deviceMappingData: request.deviceMappingData,
      // The SIMs reach the tenant already activated, on the bundle it paid for,
      // so approving is the whole activation and there is nothing left pending.
      status: 'completed' as const,
      simsActivated: request.numberOfSims,
      simsFailed: 0,
      fonuResponse: null,
      createdBy: actor.id,
      createdByName: actor.email,
      startedAt: now,
      completedAt: now,
      errorMessage: null,
      createdAt: now,
      updatedAt: now,
    };
    await this.batchRepo.save(batch);

    return {
      status: true,
      message: 'SIM provisioning request approved',
      data: {
        requestId: request.id,
        batchId,
        tenantName: request.tenantName,
        quantity: request.numberOfSims,
        operator: request.preferredOperator,
      },
    };
  }
}
