import { Inject, Injectable } from '@nestjs/common';
import { TOKEN_SERVICE, USER_REPOSITORY, ForbiddenError } from './contexts/auth/session';
import { resolveActorUser } from './contexts/auth/session/application/use-cases/support/resolve-actor-user';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import { SIM_REPOSITORY, type SimRepository } from './sim.repository';
import { SimNotFoundError } from './list-tenant-sims.use-case';
import {
  SIM_CHANGED_EVENT_PUBLISHER,
  type SimChangedEventPublisher,
  emitSimChanged,
} from './sim-changed-event.publisher';

@Injectable()
export class UpdateTenantSimUseCase {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(SIM_REPOSITORY) private readonly simRepository: SimRepository,
    @Inject(SIM_CHANGED_EVENT_PUBLISHER) private readonly simEvents: SimChangedEventPublisher,
  ) {}

  async execute(
    accessToken: string,
    simId: string,
    payload: {
      iccid?: string;
      imsi?: string;
      mobileNumber?: string;
      operator?: string;
      dataLimitGb?: number;
      monthlyRentalNaira?: number;
      simType?: string;
      notes?: string;
    },
  ) {
    const actor = await resolveActorUser(accessToken, this.tokenService, this.userRepository);
    if (actor.tenantId === 'system') throw new ForbiddenError('System actors cannot update tenant SIMs');

    const sim = await this.simRepository.findById(simId);
    if (!sim || sim.tenantId !== actor.tenantId) throw new SimNotFoundError('SIM not found');

    const updated = {
      ...sim,
      updatedAt: new Date(),
      ...(payload.iccid !== undefined && { iccid: payload.iccid }),
      ...(payload.imsi !== undefined && { imsi: payload.imsi }),
      ...(payload.mobileNumber !== undefined && { msisdn: payload.mobileNumber }),
      ...(payload.operator !== undefined && { carrier: payload.operator }),
      ...(payload.dataLimitGb !== undefined && { dataLimitMb: payload.dataLimitGb * 1024 }),
      ...(payload.monthlyRentalNaira !== undefined && { monthlyCostNgn: payload.monthlyRentalNaira }),
      ...(payload.simType !== undefined && { plan: payload.simType }),
      ...(payload.notes !== undefined && { notes: payload.notes }),
    };

    await this.simRepository.save(updated);
    await emitSimChanged(this.simEvents, updated, 'updated');

    return { status: true, message: 'success', data: { id: simId } };
  }
}
