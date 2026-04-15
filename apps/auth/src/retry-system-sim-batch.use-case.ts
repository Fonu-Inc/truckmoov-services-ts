import { Inject, Injectable } from '@nestjs/common';
import { TOKEN_SERVICE, USER_REPOSITORY } from './contexts/auth/session';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import { ensureSystemActor, SYSTEM_MUTATOR_ROLES } from './system-authz';
import {
  SIM_ACTIVATION_BATCH_REPOSITORY,
  type SimActivationBatchRepository,
} from './sim-activation-batch.repository';

export class SimBatchNotFoundError extends Error {
  constructor(id: string) {
    super(`SIM activation batch ${id} not found`);
  }
}

export class SimBatchNotRetryableError extends Error {
  constructor(id: string, status: string) {
    super(`SIM activation batch ${id} cannot be retried (status: ${status})`);
  }
}

@Injectable()
export class RetrySystemSimBatchUseCase {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(SIM_ACTIVATION_BATCH_REPOSITORY)
    private readonly batchRepo: SimActivationBatchRepository,
  ) {}

  async execute(accessToken: string, batchId: string) {
    const actor = await ensureSystemActor(
      accessToken,
      this.tokenService,
      this.userRepository,
      {
        allowedRoles: SYSTEM_MUTATOR_ROLES,
        forbiddenMessage: 'You are not permitted to retry SIM batches',
      },
    );

    const batch = await this.batchRepo.findById(batchId);
    if (!batch) throw new SimBatchNotFoundError(batchId);

    const retryableStatuses = new Set(['failed', 'partially_completed']);
    if (!retryableStatuses.has(batch.status))
      throw new SimBatchNotRetryableError(batchId, batch.status);

    const now = new Date();
    batch.status = 'pending';
    batch.simsActivated = 0;
    batch.simsFailed = 0;
    batch.errorMessage = null;
    batch.startedAt = null;
    batch.completedAt = null;
    batch.createdBy = actor.id;
    batch.createdByName = actor.email;
    batch.updatedAt = now;
    await this.batchRepo.save(batch);

    return {
      status: true,
      message: 'SIM activation batch queued for retry',
      data: {
        batchId: batch.id,
        tenantName: batch.tenantName,
        quantity: batch.quantity,
      },
    };
  }
}
