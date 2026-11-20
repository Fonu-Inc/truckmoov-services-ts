import { describe, expect, it } from 'vitest';
import {
  AutoBlockRuleNotFoundError,
  ListAutoBlockRulesUseCase,
  UpdateAutoBlockRuleUseCase,
} from '../../../apps/auth/src/auto-block-rule.use-cases';
import { InMemoryAutoBlockRuleRepository } from '../../../apps/auth/src/in-memory-auto-block-rule.repository';
import { ForbiddenError } from '../../../apps/auth/src/contexts/auth/session';

const TOKEN = 'sys-token';

function tokenService() {
  return { resolveAccessToken: () => ({ id: 'actor-1' }) as never };
}

function user(id: string, role: string, tenantId: string) {
  return { id, email: `${id}@x`, passwordHash: 'x', role, tenantId, accountStatus: 'enabled' };
}

function userRepo(actorRole = 'SYSTEM_ADMIN', actorTenant = 'system') {
  const table: Record<string, unknown> = { 'actor-1': user('actor-1', actorRole, actorTenant) };
  return { findById: async (id: string) => table[id] ?? null };
}

describe('ListAutoBlockRulesUseCase', () => {
  it('returns rules in precedence order', async () => {
    const rules = new InMemoryAutoBlockRuleRepository();
    const useCase = new ListAutoBlockRulesUseCase(tokenService() as never, userRepo() as never, rules);

    const result = await useCase.execute(TOKEN);

    expect(result.data.map((r) => r.id)).toEqual([
      'aggressive_protection', 'standard_protection', 'brute_force_prevention',
    ]);
  });
});

describe('UpdateAutoBlockRuleUseCase', () => {
  it('updates only the given fields and stamps the actor', async () => {
    const rules = new InMemoryAutoBlockRuleRepository();
    const useCase = new UpdateAutoBlockRuleUseCase(tokenService() as never, userRepo() as never, rules);

    const result = await useCase.execute(TOKEN, 'standard_protection', { enabled: false, maxAttempts: 7 });

    expect(result.data.enabled).toBe(false);
    expect(result.data.maxAttempts).toBe(7);
    expect(result.data.windowMinutes).toBe(15);
    expect(result.data.updatedBy).toBe('actor-1');
  });

  it('reports an unknown rule', async () => {
    const rules = new InMemoryAutoBlockRuleRepository();
    const useCase = new UpdateAutoBlockRuleUseCase(tokenService() as never, userRepo() as never, rules);
    await expect(
      useCase.execute(TOKEN, 'ghost_rule' as never, { enabled: false }),
    ).rejects.toBeInstanceOf(AutoBlockRuleNotFoundError);
  });

  it('refuses a caller outside the system tenant', async () => {
    const rules = new InMemoryAutoBlockRuleRepository();
    const useCase = new UpdateAutoBlockRuleUseCase(
      tokenService() as never, userRepo('OWNER_OPERATOR', 'tenant-a') as never, rules,
    );
    await expect(
      useCase.execute(TOKEN, 'standard_protection', { enabled: false }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});
