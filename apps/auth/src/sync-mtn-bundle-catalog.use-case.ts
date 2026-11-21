import { Inject, Injectable } from '@nestjs/common';
import { TOKEN_SERVICE, USER_REPOSITORY } from './contexts/auth/session';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import { ensureSystemActor } from './system-authz';
import { MtnBundleCatalogSyncService } from './contexts/mtn/mtn-bundle-catalog-sync.service';

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
    return {
      status: true,
      message: 'success',
      data: await this.sync.sync(),
    };
  }
}
