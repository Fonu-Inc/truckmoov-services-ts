import { Inject, Injectable } from '@nestjs/common';
import { TOKEN_SERVICE, USER_REPOSITORY } from './contexts/auth/session';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import { ensureSystemActor, SYSTEM_MUTATOR_ROLES } from './system-authz';
import { SIM_REPOSITORY, type SimRepository } from './sim.repository';
import { SimNotFoundError, serializeSim } from './get-system-sim-detail.use-case';

export type ReassignSystemSimInput = {
  tenantId: string | null;
  deviceId?: string | null;
};

@Injectable()
export class ReassignSystemSimUseCase {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(SIM_REPOSITORY) private readonly simRepo: SimRepository,
  ) {}

  async execute(accessToken: string, simId: string, input: ReassignSystemSimInput) {
    await ensureSystemActor(accessToken, this.tokenService, this.userRepository, {
      allowedRoles: SYSTEM_MUTATOR_ROLES,
      forbiddenMessage: 'You are not permitted to reassign SIMs',
    });

    const sim = await this.simRepo.findById(simId);
    if (!sim) throw new SimNotFoundError(simId);

    sim.tenantId = input.tenantId;
    if (input.deviceId !== undefined) sim.deviceId = input.deviceId;
    // Assigning to a tenant moves the SIM into the assigned state; clearing the
    // tenant returns it to the unassigned inventory pool.
    if (input.tenantId) {
      if (sim.status !== 'suspended' && sim.status !== 'deactivated') {
        sim.status = 'assigned';
      }
    } else {
      sim.deviceId = null;
      if (sim.status === 'assigned') sim.status = 'registered';
    }
    sim.updatedAt = new Date();
    await this.simRepo.save(sim);

    return {
      status: true,
      message: 'SIM reassigned',
      data: serializeSim(sim),
    };
  }
}
