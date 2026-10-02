import { Inject, Injectable } from '@nestjs/common';
import { TOKEN_SERVICE, USER_REPOSITORY } from './contexts/auth/session';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import { ensureSystemActor } from './system-authz';
import { SIM_REPOSITORY, type SimRepository, type StoredSim } from './sim.repository';
import { TENANT_NAME_READER, type TenantNameReader } from './tenant-name-reader.port';

export type SystemSimListFilters = {
  status?: string;
  carrier?: string;
  tenantId?: string;
  search?: string;
  page?: number;
  limit?: number;
};

export type SystemSimWithTenant = StoredSim & { tenantName: string | null };

@Injectable()
export class ListSystemSimsUseCase {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(SIM_REPOSITORY) private readonly simRepo: SimRepository,
    @Inject(TENANT_NAME_READER) private readonly tenantNames: TenantNameReader,
  ) {}

  async execute(accessToken: string, filters?: SystemSimListFilters) {
    await ensureSystemActor(accessToken, this.tokenService, this.userRepository, {
      forbiddenMessage: 'You are not permitted to view SIM inventory',
    });

    const { items, total } = await this.query(filters);
    const sims = await this.withTenantNames(items);

    return {
      status: true,
      message: 'SIM inventory retrieved',
      data: {
        total,
        sims: sims.map((s) => ({
          ...s,
          activationDate: s.activationDate?.toISOString() ?? null,
          expiryDate: s.expiryDate?.toISOString() ?? null,
          lastActivity: s.lastActivity?.toISOString() ?? null,
          createdAt: s.createdAt.toISOString(),
          updatedAt: s.updatedAt.toISOString(),
        })),
      },
    };
  }

  async list(accessToken: string, filters?: SystemSimListFilters): Promise<SystemSimWithTenant[]> {
    await ensureSystemActor(accessToken, this.tokenService, this.userRepository, {
      forbiddenMessage: 'You are not permitted to view SIM inventory',
    });
    return this.withTenantNames((await this.query(filters, true)).items);
  }

  private async query(filters: SystemSimListFilters | undefined, unpaged = false) {
    const search = filters?.search?.trim();
    const tenantIds = search ? await this.tenantNames.tenantIdsMatching(search) : undefined;
    return this.simRepo.findAll({ ...filters, search: search || undefined, tenantIds, unpaged });
  }

  private async withTenantNames(sims: StoredSim[]): Promise<SystemSimWithTenant[]> {
    const ids = [...new Set(sims.map((s) => s.tenantId).filter((id): id is string => !!id))];
    const names = await this.tenantNames.organizationNamesFor(ids);
    return sims.map((s) => ({ ...s, tenantName: s.tenantId ? (names.get(s.tenantId) ?? null) : null }));
  }
}
