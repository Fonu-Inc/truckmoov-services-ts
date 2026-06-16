import { Inject, Injectable } from '@nestjs/common';
import { TOKEN_SERVICE, USER_REPOSITORY } from './contexts/auth/session';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import { ensureSystemActor } from './system-authz';
import {
  SIM_ACTIVATION_BATCH_REPOSITORY,
  type SimActivationBatchRepository,
} from './sim-activation-batch.repository';

const ATTENTION_STATUSES = new Set(['failed', 'partially_completed']);

@Injectable()
export class GetSystemSimBatchesSummaryUseCase {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(SIM_ACTIVATION_BATCH_REPOSITORY)
    private readonly batchRepo: SimActivationBatchRepository,
  ) {}

  async execute(accessToken: string) {
    await ensureSystemActor(accessToken, this.tokenService, this.userRepository, {
      forbiddenMessage: 'You are not permitted to view SIM activation batches',
    });

    const batches = await this.batchRepo.findAll();

    return {
      status: true,
      message: 'SIM activation batches summary retrieved',
      data: {
        pendingActivation: batches.filter((b) => b.status === 'pending').length,
        inProgress: batches.filter((b) => b.status === 'in_progress').length,
        totalSimsQueued: batches
          .filter((b) => b.status !== 'completed')
          .reduce((sum, b) => sum + b.quantity, 0),
        needsAttention: batches.filter((b) => ATTENTION_STATUSES.has(b.status))
          .length,
      },
    };
  }
}
