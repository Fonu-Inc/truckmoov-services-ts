import { Inject, Injectable } from '@nestjs/common';
import { TOKEN_SERVICE, USER_REPOSITORY } from './contexts/auth/session';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import { ensureSystemActor } from './system-authz';
import {
  SIM_ACTIVATION_BATCH_REPOSITORY,
  type SimActivationBatchRepository,
} from './sim-activation-batch.repository';

@Injectable()
export class ListSystemSimBatchesUseCase {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(SIM_ACTIVATION_BATCH_REPOSITORY)
    private readonly batchRepo: SimActivationBatchRepository,
  ) {}

  async execute(accessToken: string, filters?: { status?: string }) {
    await ensureSystemActor(accessToken, this.tokenService, this.userRepository, {
      forbiddenMessage: 'You are not permitted to view SIM activation batches',
    });

    const batches = await this.batchRepo.findAll(filters);

    return {
      status: true,
      message: 'SIM activation batches retrieved',
      data: {
        total: batches.length,
        batches: batches.map((b) => ({
          ...b,
          startedAt: b.startedAt?.toISOString() ?? null,
          completedAt: b.completedAt?.toISOString() ?? null,
          createdAt: b.createdAt.toISOString(),
          updatedAt: b.updatedAt.toISOString(),
        })),
      },
    };
  }
}
