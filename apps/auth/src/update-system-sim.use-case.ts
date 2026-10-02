import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { TOKEN_SERVICE, USER_REPOSITORY } from './contexts/auth/session';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import { ensureSystemActor, SYSTEM_MUTATOR_ROLES } from './system-authz';
import { SIM_REPOSITORY, type SimRepository, type StoredSim } from './sim.repository';
import { SimNotFoundError, serializeSim } from './get-system-sim-detail.use-case';
import {
  DuplicateSimIccidError,
  cleanText,
  invalidCarrier,
  invalidIccid,
  invalidImsi,
  invalidMsisdn,
} from './system-sim-input';
import {
  SIM_CHANGED_EVENT_PUBLISHER,
  type SimChangedEventPublisher,
  emitSimChanged,
} from './sim-changed-event.publisher';

export type UpdateSystemSimInput = {
  iccid?: string;
  msisdn?: string;
  imsi?: string | null;
  plan?: string;
  carrier?: string;
  dataLimitMb?: number;
  smsLimit?: number;
};

@Injectable()
export class UpdateSystemSimUseCase {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(SIM_REPOSITORY) private readonly simRepo: SimRepository,
    @Inject(SIM_CHANGED_EVENT_PUBLISHER) private readonly simEvents: SimChangedEventPublisher,
  ) {}

  async execute(accessToken: string, simId: string, patch: UpdateSystemSimInput) {
    await ensureSystemActor(accessToken, this.tokenService, this.userRepository, {
      allowedRoles: SYSTEM_MUTATOR_ROLES,
      forbiddenMessage: 'You are not permitted to update SIMs',
    });

    const sim = await this.simRepo.findById(simId);
    if (!sim) throw new SimNotFoundError(simId);

    await this.applyIdentity(sim, patch);
    if (patch.plan !== undefined) sim.plan = patch.plan;
    if (patch.carrier !== undefined) sim.carrier = cleanText(patch.carrier);
    if (patch.dataLimitMb !== undefined) sim.dataLimitMb = patch.dataLimitMb;
    if (patch.smsLimit !== undefined) sim.smsLimit = patch.smsLimit;
    sim.updatedAt = new Date();
    await this.simRepo.save(sim);
    await emitSimChanged(this.simEvents, sim, 'updated');

    return {
      status: true,
      message: 'SIM updated',
      data: serializeSim(sim),
    };
  }

  private async applyIdentity(sim: StoredSim, patch: UpdateSystemSimInput) {
    const invalid =
      (patch.iccid !== undefined ? invalidIccid(patch.iccid) : null) ??
      (patch.msisdn !== undefined ? invalidMsisdn(patch.msisdn) : null) ??
      invalidImsi(patch.imsi) ??
      invalidCarrier(patch.carrier);
    if (invalid) throw new BadRequestException(invalid);
    if (patch.carrier !== undefined && !cleanText(patch.carrier)) throw new BadRequestException('Carrier is required');

    if (patch.iccid !== undefined && cleanText(patch.iccid) !== sim.iccid) {
      const iccid = cleanText(patch.iccid);
      const clash = await this.simRepo.findByIccid(iccid);
      if (clash && clash.id !== sim.id) throw new DuplicateSimIccidError(iccid);
      sim.iccid = iccid;
    }
    if (patch.msisdn !== undefined) sim.msisdn = cleanText(patch.msisdn);
    if (patch.imsi !== undefined) sim.imsi = cleanText(patch.imsi) || null;
  }
}
