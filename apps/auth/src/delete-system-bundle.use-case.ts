import { Inject, Injectable } from '@nestjs/common';
import { TOKEN_SERVICE, USER_REPOSITORY } from './contexts/auth/session';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import { ensureSystemActor } from './system-authz';
import { BUNDLE_CATALOG_REPOSITORY, type BundleCatalogRepository } from './bundle-catalog.repository';
import { BundleNotFoundError, CarrierManagedBundleError, isCarrierManagedBundle } from './update-system-bundle.use-case';

@Injectable()
export class DeleteSystemBundleUseCase {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(BUNDLE_CATALOG_REPOSITORY) private readonly bundleCatalogRepository: BundleCatalogRepository,
  ) {}

  async execute(accessToken: string, bundleId: string) {
    await ensureSystemActor(accessToken, this.tokenService, this.userRepository);

    const bundle = await this.bundleCatalogRepository.findById(bundleId);
    if (!bundle) throw new BundleNotFoundError();
    if (isCarrierManagedBundle(bundle.id)) throw new CarrierManagedBundleError();

    await this.bundleCatalogRepository.save({ ...bundle, active: false, updatedAt: new Date() });

    return { status: true, message: 'success', data: { id: bundleId } };
  }
}
