import { Inject, Injectable } from '@nestjs/common';
import { TOKEN_SERVICE, USER_REPOSITORY } from './contexts/auth/session';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import { ensureSystemActor } from './system-authz';
import { MtnBundleCatalogSyncService } from './contexts/mtn/mtn-bundle-catalog-sync.service';

export class MtnBundleSyncBusyError extends Error {
  constructor() {
    super('Another MTN catalogue sync is already running');
    this.name = 'MtnBundleSyncBusyError';
  }
}

@Injectable()
export class SyncMtnBundleCatalogUseCase {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(MtnBundleCatalogSyncService)
    private readonly sync: MtnBundleCatalogSyncService,
  ) {}

  async execute(accessToken: string) {
    await ensureSystemActor(accessToken, this.tokenService, this.userRepository);
    const summary = await this.sync.syncExclusively();
    if (!summary) throw new MtnBundleSyncBusyError();
    return {
      status: true,
      message: 'success',
      data: summary,
    };
  }
}
