import { Inject, Injectable } from '@nestjs/common';
import { TOKEN_SERVICE, USER_REPOSITORY, ForbiddenError } from './contexts/auth/session';
import { resolveActorUser } from './contexts/auth/session/application/use-cases/support/resolve-actor-user';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import { SIM_REPOSITORY, type SimRepository } from './sim.repository';
import { BUNDLE_CARRIER_REPOSITORY, type BundleCarrierRepository } from './bundle-carrier.repository';

type Filters = { search?: string; carrierId?: string; status?: string };

@Injectable()
export class ListSimsForAllocationUseCase {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(SIM_REPOSITORY) private readonly simRepository: SimRepository,
    @Inject(BUNDLE_CARRIER_REPOSITORY) private readonly carriers: BundleCarrierRepository,
  ) {}

  async execute(accessToken: string, filters?: Filters) {
    const actor = await resolveActorUser(accessToken, this.tokenService, this.userRepository);
    if (actor.tenantId === 'system') throw new ForbiddenError('System actors cannot list tenant SIMs');

    const carrier = await this.carrierName(filters?.carrierId);
    if (carrier === null) return { status: true, message: 'success', data: { items: [] } };
    const { items } = await this.simRepository.findAll({
      tenantId: actor.tenantId!,
      search: filters?.search,
      carrier,
      status: filters?.status,
      limit: 500,
    });

    return {
      status: true,
      message: 'success',
      data: {
        items: items.map((s) => ({
          id: s.id,
          mobileNumber: s.msisdn ?? '',
          iccid: s.iccid,
          carrier: s.carrier,
          status: s.status,
          assignedDevice: s.deviceId ? { id: s.deviceId, name: s.deviceName ?? '' } : null,
        })),
      },
    };
  }

  /**
   * A SIM records its network by name ("MTN") while the catalog names a carrier
   * by id, so the filter goes through the carrier. Null means no such carrier.
   */
  private async carrierName(carrierId?: string): Promise<string | undefined | null> {
    if (!carrierId) return undefined;
    const carrier = await this.carriers.findById(carrierId);
    return carrier ? carrier.name : null;
  }
}
