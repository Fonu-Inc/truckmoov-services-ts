import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { TOKEN_SERVICE, USER_REPOSITORY } from './contexts/auth/session';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import { ensureSystemActor, SYSTEM_MUTATOR_ROLES } from './system-authz';
import { SIM_REPOSITORY, type SimRepository } from './sim.repository';
import { serializeSim } from './get-system-sim-detail.use-case';
import {
  DuplicateSimIccidError,
  cleanText,
  invalidSimFieldReason,
  newUnassignedSim,
  type NewSystemSimInput,
} from './system-sim-input';

@Injectable()
export class CreateSystemSimUseCase {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(SIM_REPOSITORY) private readonly simRepo: SimRepository,
  ) {}

  async execute(accessToken: string, input: NewSystemSimInput) {
    await ensureSystemActor(accessToken, this.tokenService, this.userRepository, {
      allowedRoles: SYSTEM_MUTATOR_ROLES,
      forbiddenMessage: 'You are not permitted to register SIMs',
    });

    const invalid = invalidSimFieldReason(input);
    if (invalid) throw new BadRequestException(invalid);
    if (!cleanText(input.carrier)) throw new BadRequestException('Carrier is required');
    if (await this.simRepo.findByIccid(cleanText(input.iccid))) {
      throw new DuplicateSimIccidError(cleanText(input.iccid));
    }

    const sim = newUnassignedSim(input);
    await this.simRepo.save(sim);

    return { status: true, message: 'SIM registered', data: serializeSim(sim) };
  }
}
