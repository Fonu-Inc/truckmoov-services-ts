import { Inject, Injectable } from '@nestjs/common';
import { TOKEN_SERVICE, USER_REPOSITORY } from './contexts/auth/session';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import { ensureSystemActor } from './system-authz';
import {
  AUTO_BLOCK_RULE_REPOSITORY,
  type AutoBlockRuleId,
  type AutoBlockRuleRepository,
} from './auto-block-rule.repository';

export class AutoBlockRuleNotFoundError extends Error {}

@Injectable()
export class ListAutoBlockRulesUseCase {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(AUTO_BLOCK_RULE_REPOSITORY) private readonly rules: AutoBlockRuleRepository,
  ) {}

  async execute(accessToken: string) {
    await ensureSystemActor(accessToken, this.tokenService, this.userRepository, {
      forbiddenMessage: 'You are not permitted to view auto-block rules',
    });
    const rules = await this.rules.findAll();
    return { status: true, message: 'Auto-block rules retrieved', data: rules };
  }
}

export type UpdateAutoBlockRuleCommand = {
  enabled?: boolean;
  maxAttempts?: number;
  windowMinutes?: number;
  blockDurationHours?: number | null;
};

@Injectable()
export class UpdateAutoBlockRuleUseCase {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(AUTO_BLOCK_RULE_REPOSITORY) private readonly rules: AutoBlockRuleRepository,
  ) {}

  async execute(accessToken: string, id: AutoBlockRuleId, command: UpdateAutoBlockRuleCommand) {
    const actor = await ensureSystemActor(accessToken, this.tokenService, this.userRepository, {
      forbiddenMessage: 'You are not permitted to change auto-block rules',
    });
    const rule = await this.rules.findById(id);
    if (!rule) throw new AutoBlockRuleNotFoundError('Auto-block rule not found');

    const updated = {
      ...rule,
      ...(command.enabled !== undefined ? { enabled: command.enabled } : {}),
      ...(command.maxAttempts !== undefined ? { maxAttempts: command.maxAttempts } : {}),
      ...(command.windowMinutes !== undefined ? { windowMinutes: command.windowMinutes } : {}),
      ...(command.blockDurationHours !== undefined ? { blockDurationHours: command.blockDurationHours } : {}),
      updatedAt: new Date(),
      updatedBy: actor.id,
    };
    await this.rules.save(updated);
    return { status: true, message: 'Auto-block rule updated', data: updated };
  }
}
