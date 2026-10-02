import { Inject, Injectable } from '@nestjs/common';
import { TOKEN_SERVICE, USER_REPOSITORY } from './contexts/auth/session';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import { ensureSystemActor, SYSTEM_MUTATOR_ROLES } from './system-authz';
import { SIM_REPOSITORY, type SimRepository } from './sim.repository';
import { cleanText, invalidSimFieldReason, newUnassignedSim, type NewSystemSimInput } from './system-sim-input';

export type ImportSimRowOutcome = {
  row: number;
  iccid: string;
  outcome: 'imported' | 'skipped' | 'failed';
  reason: string | null;
  simId: string | null;
};

@Injectable()
export class ImportSystemSimsUseCase {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(SIM_REPOSITORY) private readonly simRepo: SimRepository,
  ) {}

  async execute(accessToken: string, rows: NewSystemSimInput[]) {
    await ensureSystemActor(accessToken, this.tokenService, this.userRepository, {
      allowedRoles: SYSTEM_MUTATOR_ROLES,
      forbiddenMessage: 'You are not permitted to import SIMs',
    });

    const existing = new Set(
      (await this.simRepo.findByIccids(rows.map((r) => cleanText(r.iccid)))).map((s) => s.iccid),
    );
    const seen = new Set<string>();
    const results: ImportSimRowOutcome[] = [];
    for (const [index, row] of rows.entries()) {
      results.push(await this.importRow(index + 1, row, existing, seen));
    }

    const count = (outcome: ImportSimRowOutcome['outcome']) => results.filter((r) => r.outcome === outcome).length;
    const imported = count('imported');
    return {
      status: true,
      message: `${imported} SIM(s) imported`,
      data: { imported, skipped: count('skipped'), failed: count('failed'), results },
    };
  }

  private async importRow(
    row: number,
    input: NewSystemSimInput,
    existing: Set<string>,
    seen: Set<string>,
  ): Promise<ImportSimRowOutcome> {
    const iccid = cleanText(input.iccid);
    const invalid = invalidSimFieldReason(input);
    if (invalid) return { row, iccid, outcome: 'failed', reason: invalid, simId: null };
    if (existing.has(iccid)) return { row, iccid, outcome: 'skipped', reason: 'Already in inventory', simId: null };
    if (seen.has(iccid)) return { row, iccid, outcome: 'skipped', reason: 'Repeated in this file', simId: null };
    seen.add(iccid);

    const sim = newUnassignedSim(input);
    try {
      await this.simRepo.save(sim);
    } catch (error) {
      return { row, iccid, outcome: 'failed', reason: (error as Error).message, simId: null };
    }
    return { row, iccid, outcome: 'imported', reason: null, simId: sim.id };
  }
}
