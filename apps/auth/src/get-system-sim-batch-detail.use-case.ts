import { Inject, Injectable } from '@nestjs/common';
import { TOKEN_SERVICE, USER_REPOSITORY } from './contexts/auth/session';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import { ensureSystemActor } from './system-authz';
import {
  SIM_ACTIVATION_BATCH_REPOSITORY,
  type SimActivationBatchRepository,
  type StoredSimActivationBatch,
} from './sim-activation-batch.repository';
import { SimBatchNotFoundError } from './retry-system-sim-batch.use-case';

export function serializeBatch(b: StoredSimActivationBatch) {
  return {
    ...b,
    startedAt: b.startedAt?.toISOString() ?? null,
    completedAt: b.completedAt?.toISOString() ?? null,
    createdAt: b.createdAt.toISOString(),
    updatedAt: b.updatedAt.toISOString(),
  };
}

@Injectable()
export class GetSystemSimBatchDetailUseCase {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(SIM_ACTIVATION_BATCH_REPOSITORY)
    private readonly batchRepo: SimActivationBatchRepository,
  ) {}

  async execute(accessToken: string, batchId: string) {
    await ensureSystemActor(accessToken, this.tokenService, this.userRepository, {
      forbiddenMessage: 'You are not permitted to view SIM activation batches',
    });

    const batch = await this.batchRepo.findById(batchId);
    if (!batch) throw new SimBatchNotFoundError(batchId);

    return {
      status: true,
      message: 'SIM activation batch detail retrieved',
      data: serializeBatch(batch),
    };
  }
}
