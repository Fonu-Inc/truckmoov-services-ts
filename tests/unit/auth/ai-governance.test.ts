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
import { maskDriverName, redactPrompt } from '../../../apps/auth/src/ai-redaction';
import {
  buildMatchingPrompt,
  parseMatchingResponse,
  type MatchCandidate,
} from '../../../apps/auth/src/ai-matching';

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

  // A prompt that calls every driver "[driver]" cannot say which one it means,
  // so the answer comes back useless.
  it('masks a driver name partially, not completely', () => {
    expect(maskDriverName('Adebayo Johnson')).toBe('Adebayo J.');
    expect(maskDriverName('Ada')).toBe('Ada');
    expect(maskDriverName('  ')).toBe('');
  });
});

describe('Load matching', () => {
  const candidates: MatchCandidate[] = [
    {
      vehicleId: 'veh-1',
      registrationNumber: 'LAG-234-XY',
      make: 'Mercedes',
      model: 'Actros',
      capacity: 30,
      capacityUnit: 'tons',
      driverId: 'drv-1',
      driverName: 'Adebayo Johnson',
      currentRegion: 'Lagos',
      status: 'active',
    },
    {
      vehicleId: 'veh-2',
      registrationNumber: 'LAG-567-AB',
      make: 'MAN',
      model: 'TGS',
      capacity: 20,
      capacityUnit: 'tons',
      driverId: null,
      driverName: null,
      currentRegion: 'Ibadan',
      status: 'idle',
    },
  ];

  const load = {
    jobReference: 'JOB-2481',
    pickupAddress: 'Apapa Port',
    dropoffAddress: 'Victoria Island',
    weightKg: 18000,
    requiredVehicleType: 'truck',
    deadline: null,
  };

  const protection = {
    redactPhoneNumbers: true,
    redactDriverNames: true,
    redactVehiclePlates: false,
    storePromptsAndResponses: false,
  };

  it('numbers candidates rather than naming them', () => {
    const prompt = buildMatchingPrompt(load, candidates, protection);
    expect(prompt).toContain('1. Mercedes Actros');
    expect(prompt).toContain('2. MAN TGS');
    // The identifier never leaves, so a hallucinated one cannot come back.
    expect(prompt).not.toContain('veh-1');
  });

  it('honours driver-name redaction in the prompt', () => {
    expect(buildMatchingPrompt(load, candidates, protection)).toContain('driver Adebayo J.');
  });

  it('resolves an index back to a vehicle and its driver', () => {
    const suggestions = parseMatchingResponse(
      '{"suggestions":[{"candidate":1,"score":88,"reason":"Closest and big enough"}]}',
      candidates,
    );
    expect(suggestions).toEqual([
      { vehicleId: 'veh-1', driverId: 'drv-1', score: 88, reason: 'Closest and big enough' },
    ]);
  });

  it('reads JSON out of a reply wrapped in prose', () => {
    const suggestions = parseMatchingResponse(
      'Sure! ```json\n{"suggestions":[{"candidate":2,"score":50,"reason":"Available"}]}\n```',
      candidates,
    );
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].vehicleId).toBe('veh-2');
  });

  // A suggestion is something a dispatcher acts on, so a fabricated one is
  // worse than a missing one.
  it('drops a candidate the model invented', () => {
    expect(
      parseMatchingResponse('{"suggestions":[{"candidate":9,"score":99,"reason":"x"}]}', candidates),
    ).toEqual([]);
  });

  it('drops a repeated candidate and clamps a silly score', () => {
    const suggestions = parseMatchingResponse(
      '{"suggestions":[{"candidate":1,"score":500,"reason":"a"},{"candidate":1,"score":10,"reason":"b"}]}',
      candidates,
    );
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].score).toBe(100);
  });

  it('returns nothing for an unparseable reply', () => {
    expect(parseMatchingResponse('I cannot help with that', candidates)).toEqual([]);
    expect(parseMatchingResponse('{broken', candidates)).toEqual([]);
  });

  it('ranks best first and keeps at most three', () => {
    const many = parseMatchingResponse(
      '{"suggestions":[{"candidate":2,"score":40,"reason":"b"},{"candidate":1,"score":90,"reason":"a"}]}',
      candidates,
    );
    expect(many.map((suggestion) => suggestion.score)).toEqual([90, 40]);
  });
});
