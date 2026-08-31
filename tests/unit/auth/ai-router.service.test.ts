import { describe, expect, it, vi } from 'vitest';
import { AiRouterService, AiRoutingUnavailableError } from '../../../apps/auth/src/ai-routing/ai-router.service';

describe('AiRouterService', () => {
  const request = { requestId: 'r1', tenantId: 't1', userId: 'u1', featureKey: 'waybill.extract', input: {} };

  it('routes to the first healthy eligible provider', async () => {
    const router = new AiRouterService();
    const complete = vi.fn(async () => ({ ok: true }));
    router.registerProvider({ key: 'openrouter', enabled: true, complete });
    router.registerAgent({ key: 'extractor', featureKeys: ['waybill.extract'], enabled: true, priority: 1, routes: [{ providerKey: 'openrouter', model: 'model-a', priority: 1 }] });
    await expect(router.route(request, { enabled: true })).resolves.toMatchObject({ providerKey: 'openrouter', model: 'model-a' });
    expect(complete).toHaveBeenCalledOnce();
  });

  it('falls back after a provider failure', async () => {
    const router = new AiRouterService();
    const failed = vi.fn(async () => { throw new Error('provider down'); });
    const healthy = vi.fn(async () => 'fallback');
    router.registerProvider({ key: 'first', enabled: true, complete: failed });
    router.registerProvider({ key: 'second', enabled: true, complete: healthy });
    router.registerAgent({ key: 'extractor', featureKeys: ['waybill.extract'], enabled: true, priority: 1, routes: [{ providerKey: 'first', model: 'a', priority: 1 }, { providerKey: 'second', model: 'b', priority: 2 }] });
    await expect(router.route(request, { enabled: true })).resolves.toMatchObject({ output: 'fallback', attempts: 2 });
  });

  it('rejects a user preference that is not eligible for the feature', async () => {
    const router = new AiRouterService();
    router.registerAgent({ key: 'other', featureKeys: ['other.feature'], enabled: true, priority: 1, routes: [] });
    await expect(router.route({ ...request, preferredAgentKey: 'other' }, { enabled: true })).rejects.toBeInstanceOf(AiRoutingUnavailableError);
  });

  it('does not call a route blocked by policy', async () => {
    const router = new AiRouterService();
    const complete = vi.fn(async () => 'should-not-run');
    router.registerProvider({ key: 'openrouter', enabled: true, complete });
    router.registerAgent({ key: 'extractor', featureKeys: ['waybill.extract'], enabled: true, priority: 1, routes: [{ providerKey: 'openrouter', model: 'restricted', priority: 1 }] });
    await expect(router.route(request, { enabled: true, allowedModels: ['allowed'] })).rejects.toBeInstanceOf(AiRoutingUnavailableError);
    expect(complete).not.toHaveBeenCalled();
  });
});
