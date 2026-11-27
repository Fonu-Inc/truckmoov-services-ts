import { Inject, Injectable } from '@nestjs/common';
import {
  TOKEN_SERVICE,
  USER_REPOSITORY,
  ForbiddenError,
} from './contexts/auth/session';
import { resolveActorUser } from './contexts/auth/session/application/use-cases/support/resolve-actor-user';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import {
  optionalAddressLine,
  optionalAddressLine2,
  requireCity,
  requireCountry,
  requireState,
} from '@shared/nigeria';
import {
  TENANT_BUSINESS_INFO_REPOSITORY,
  type TenantBusinessInfoRepository,
  type StoredTenantBusinessInfo,
} from './tenant-business-info.repository';

export type SaveBusinessInfoPayload = Omit<
  StoredTenantBusinessInfo,
  'tenantId' | 'verificationStatus' | 'updatedAt'
>;

const blank = (value: string | null) => value === null || value.trim() === '';

// A value equal to what is stored is only echoed back, so it is not judged again.
function validAddress(payload: SaveBusinessInfoPayload, stored: StoredTenantBusinessInfo | null): SaveBusinessInfoPayload {
  const same = (value: string | null, was: string | null | undefined) => !!was && value === was;
  const state = blank(payload.state) ? null : same(payload.state, stored?.state) ? payload.state : requireState(payload.state);
  return {
    ...payload,
    addressLine1: optionalAddressLine(payload.addressLine1, 'addressLine1', stored?.addressLine1),
    addressLine2: optionalAddressLine2(payload.addressLine2, 'addressLine2', stored?.addressLine2),
    city: blank(payload.city) ? null : same(payload.city, stored?.city) ? payload.city : requireCity(payload.city, state, false),
    state,
    country: blank(payload.country) ? null : same(payload.country, stored?.country) ? payload.country : requireCountry(payload.country),
  };
}

@Injectable()
export class SaveBusinessInfoUseCase {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(TENANT_BUSINESS_INFO_REPOSITORY)
    private readonly businessInfoRepository: TenantBusinessInfoRepository,
  ) {}

  async execute(accessToken: string, payload: SaveBusinessInfoPayload) {
    const actor = await resolveActorUser(
      accessToken,
      this.tokenService,
      this.userRepository,
    );
    if (actor.tenantId === 'system') {
      throw new ForbiddenError('System actors cannot save business info');
    }

    const existing = await this.businessInfoRepository.findByTenantId(
      actor.tenantId,
    );
    const address = validAddress(payload, existing);

    await this.businessInfoRepository.save({
      ...address,
      tenantId: actor.tenantId,
      verificationStatus: existing?.verificationStatus ?? 'pending',
      updatedAt: new Date(),
    });

    return { status: true, message: 'success', data: null };
  }
}
