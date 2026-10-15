import { describe, expect, it } from 'vitest';
import {
  buildDefaultAiGovernance,
  normalizeAiGovernance,
} from '../../../apps/auth/src/ai-governance.repository';
import {
  InMemoryAiGovernanceRepository,
} from '../../../apps/auth/src/mikro-ai-governance.repository';
import { InMemoryAiRequestLogRepository } from '../../../apps/auth/src/in-memory-ai-request-log.repository';
import {
  GetAiUsageUseCase,
  InvalidAiSettingsError,
  UpdateAiGovernanceUseCase,
} from '../../../apps/auth/src/ai-governance.use-cases';
import { redactPrompt } from '../../../apps/auth/src/ai-redaction';

const TOKEN = 'system-token';

function actor() {
  return { resolveAccessToken: () => ({ id: 'sys1' }) as never };
}

function users() {
  return {
    findById: async () => ({
      id: 'sys1',
      email: 'admin@system',
      passwordHash: 'x',
      role: 'SYSTEM_ADMIN',
      tenantId: 'system',
      accountStatus: 'enabled',
    }),
  };
}

function updater(repo: InMemoryAiGovernanceRepository) {
  return new UpdateAiGovernanceUseCase(actor() as never, users() as never, repo);
}

describe('AI governance defaults', () => {
  // An AI feature that starts spending money on first boot is not a feature
  // anybody asked for.
  it('ships disabled, with every provider off', () => {
    const defaults = buildDefaultAiGovernance();
    expect(defaults.matchingEnabled).toBe(false);
    expect(defaults.providers.every((provider) => provider.enabled === false)).toBe(true);
  });

  it('redacts phone numbers by default and stores no bodies', () => {
    const { dataProtection } = buildDefaultAiGovernance();
    expect(dataProtection.redactPhoneNumbers).toBe(true);
    expect(dataProtection.storePromptsAndResponses).toBe(false);
  });

  // A provider added in code has to appear on a row written before it existed.
  it('fills a provider the stored row has never heard of', () => {
    const settings = normalizeAiGovernance({
      matchingEnabled: true,
      providers: [
        {
          provider: 'openai',
          label: 'OpenAI',
          description: '',
          enabled: true,
          allowedModels: ['gpt-4o'],
          defaultModel: 'gpt-4o',
          allowedTools: [],
        },
      ],
    });

    expect(settings.providers).toHaveLength(3);
    expect(settings.providers.find((p) => p.provider === 'anthropic')?.enabled).toBe(false);
    expect(settings.providers.find((p) => p.provider === 'openai')?.allowedModels).toEqual(['gpt-4o']);
  });

  it('treats a missing row as the defaults', () => {
    expect(normalizeAiGovernance(null).matchingEnabled).toBe(false);
  });
});

describe('Updating AI governance', () => {
  it('patches one provider and leaves the others alone', async () => {
    const repo = new InMemoryAiGovernanceRepository();
    const result = await updater(repo).execute({
      accessToken: TOKEN,
      providers: [{ provider: 'anthropic', enabled: true }],
    });

    expect(result.data.providers.find((p) => p.provider === 'anthropic')?.enabled).toBe(true);
    expect(result.data.providers.find((p) => p.provider === 'openai')?.enabled).toBe(false);
  });

  it('records who changed it', async () => {
    const repo = new InMemoryAiGovernanceRepository();
    const result = await updater(repo).execute({ accessToken: TOKEN, matchingEnabled: true });
    expect(result.data.updatedByUserId).toBe('sys1');
  });

  it('refuses an unknown provider or tool', async () => {
    const repo = new InMemoryAiGovernanceRepository();
    await expect(
      updater(repo).execute({ accessToken: TOKEN, providers: [{ provider: 'cohere' }] }),
    ).rejects.toBeInstanceOf(InvalidAiSettingsError);
    await expect(
      updater(repo).execute({
        accessToken: TOKEN,
        providers: [{ provider: 'openai', allowedTools: ['dispatch_job'] }],
      }),
    ).rejects.toBeInstanceOf(InvalidAiSettingsError);
  });

  // A default outside the allowlist would be chosen and then refused on every
  // call that named no model.
  it('refuses a default model that is not allowed', async () => {
    const repo = new InMemoryAiGovernanceRepository();
    await expect(
      updater(repo).execute({
        accessToken: TOKEN,
        providers: [{ provider: 'openai', allowedModels: ['gpt-4o'], defaultModel: 'gpt-5' }],
      }),
    ).rejects.toThrow(/cannot be the default/);
  });

  it('refuses an empty allowlist, pointing at the toggle instead', async () => {
    const repo = new InMemoryAiGovernanceRepository();
    await expect(
      updater(repo).execute({
        accessToken: TOKEN,
        providers: [{ provider: 'openai', allowedModels: [] }],
      }),
    ).rejects.toThrow(/at least one allowed model/);
  });

  it('refuses a rate limit that is not a positive whole number', async () => {
    const repo = new InMemoryAiGovernanceRepository();
    for (const maxRequestsPerMinute of [0, -5, 1.5]) {
      await expect(
        updater(repo).execute({ accessToken: TOKEN, rateLimits: { maxRequestsPerMinute } }),
      ).rejects.toBeInstanceOf(InvalidAiSettingsError);
    }
  });
});

describe('AI usage aggregation', () => {
  async function seed(log: InMemoryAiRequestLogRepository) {
    const base = {
      feature: 'load_vehicle_driver_matching',
      promptTokens: 0,
      completionTokens: 0,
      latencyMs: 500,
      errorMessage: null,
      promptBody: null,
      responseBody: null,
      createdAt: new Date(),
    };
    await log.record({ ...base, id: '1', tenantId: 't1', provider: 'openai', model: 'gpt-4o', totalTokens: 300, succeeded: true });
    await log.record({ ...base, id: '2', tenantId: 't1', provider: 'openai', model: 'gpt-4o', totalTokens: 100, succeeded: true });
    await log.record({ ...base, id: '3', tenantId: 't2', provider: 'anthropic', model: 'claude-3-haiku', totalTokens: 600, succeeded: false });
  }

  it('totals requests, tokens, success rate and latency', async () => {
    const log = new InMemoryAiRequestLogRepository();
    await seed(log);

    const result = await new GetAiUsageUseCase(actor() as never, users() as never, log).execute(TOKEN);
    expect(result.data.totalRequests).toBe(3);
    expect(result.data.totalTokens).toBe(1000);
    expect(result.data.successRate).toBe(66.7);
    expect(result.data.averageLatencyMs).toBe(500);
  });

  it('shares tokens out per tenant', async () => {
    const log = new InMemoryAiRequestLogRepository();
    await seed(log);

    const result = await new GetAiUsageUseCase(actor() as never, users() as never, log).execute(TOKEN);
    const t2 = result.data.byTenant.find((tenant) => tenant.tenantId === 't2');
    expect(t2).toMatchObject({ requests: 1, tokens: 600, percentOfTotal: 60 });
    const t1 = result.data.byTenant.find((tenant) => tenant.tenantId === 't1');
    expect(t1?.averageTokensPerRequest).toBe(200);
  });

  // A success rate over zero requests is not a fact about the platform.
  it('reports nulls rather than a perfect score before anything has run', async () => {
    const log = new InMemoryAiRequestLogRepository();
    const result = await new GetAiUsageUseCase(actor() as never, users() as never, log).execute(TOKEN);

    expect(result.data.totalRequests).toBe(0);
    expect(result.data.successRate).toBeNull();
    expect(result.data.averageLatencyMs).toBeNull();
  });

  it('counts a tenant\'s requests and tokens inside a window, for the rate limits', async () => {
    const log = new InMemoryAiRequestLogRepository();
    await seed(log);

    expect(await log.countSince('t1', new Date(Date.now() - 60_000))).toBe(2);
    expect(await log.tokensSince('t1', new Date(Date.now() - 60_000))).toBe(400);
    expect(await log.tokensSince('t1', new Date(Date.now() + 60_000))).toBe(0);
  });
});

describe('Prompt redaction', () => {
  const on = {
    redactPhoneNumbers: true,
    redactDriverNames: true,
    redactVehiclePlates: true,
    storePromptsAndResponses: false,
  };
  const off = {
    redactPhoneNumbers: false,
    redactDriverNames: false,
    redactVehiclePlates: false,
    storePromptsAndResponses: false,
  };

  it('strips Nigerian numbers however they are written', () => {
    for (const phone of ['+2348012345678', '08012345678', '+234 801 234 5678']) {
      expect(redactPrompt(`call ${phone} now`, on)).toBe('call [phone] now');
    }
  });

  it('strips plates', () => {
    expect(redactPrompt('vehicle LAG-234-XY is idle', on)).toBe('vehicle [plate] is idle');
  });

  it('leaves everything alone when redaction is off', () => {
    expect(redactPrompt('call 08012345678 about LAG-234-XY', off)).toBe(
      'call 08012345678 about LAG-234-XY',
    );
  });
});
