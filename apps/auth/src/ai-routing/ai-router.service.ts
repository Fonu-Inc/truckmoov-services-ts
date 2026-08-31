import { Injectable } from '@nestjs/common';

export type AiRequest = {
  requestId: string;
  tenantId: string;
  userId: string;
  featureKey: string;
  input: unknown;
  preferredAgentKey?: string;
};

export type AiAgentRoute = {
  providerKey: string;
  model: string;
  priority: number;
};

export type AiAgent = {
  key: string;
  featureKeys: string[];
  enabled: boolean;
  priority: number;
  routes: AiAgentRoute[];
};

export type AiPolicy = {
  enabled: boolean;
  allowedProviderKeys?: string[];
  allowedModels?: string[];
  maxAttempts?: number;
};

export type AiProvider = {
  key: string;
  enabled: boolean;
  complete(request: AiRequest, agent: AiAgent, route: AiAgentRoute): Promise<unknown>;
};

export type AiRouteResult = {
  output: unknown;
  agentKey: string;
  providerKey: string;
  model: string;
  attempts: number;
};

export class AiRoutingUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AiRoutingUnavailableError';
  }
}

/** Provider-neutral routing seam. Provider credentials stay outside feature code. */
@Injectable()
export class AiRouterService {
  private readonly agents = new Map<string, AiAgent>();
  private readonly providers = new Map<string, AiProvider>();

  registerAgent(agent: AiAgent): void {
    this.agents.set(agent.key, { ...agent, routes: [...agent.routes] });
  }

  registerProvider(provider: AiProvider): void {
    this.providers.set(provider.key, provider);
  }

  async route(request: AiRequest, policy: AiPolicy): Promise<AiRouteResult> {
    if (!policy.enabled) throw new AiRoutingUnavailableError('AI is disabled by platform policy');
    const agents = [...this.agents.values()]
      .filter((agent) => agent.enabled && agent.featureKeys.includes(request.featureKey))
      .filter((agent) => !request.preferredAgentKey || agent.key === request.preferredAgentKey)
      .sort((a, b) => a.priority - b.priority);
    if (agents.length === 0) throw new AiRoutingUnavailableError('No eligible AI agent is configured');

    const attemptsLimit = Math.max(1, policy.maxAttempts ?? Number.MAX_SAFE_INTEGER);
    let attempts = 0;
    for (const agent of agents) {
      const routes = [...agent.routes].sort((a, b) => a.priority - b.priority);
      for (const route of routes) {
        if (attempts >= attemptsLimit) break;
        if (policy.allowedProviderKeys && !policy.allowedProviderKeys.includes(route.providerKey)) continue;
        if (policy.allowedModels && !policy.allowedModels.includes(route.model)) continue;
        const provider = this.providers.get(route.providerKey);
        if (!provider?.enabled) continue;
        attempts += 1;
        try {
          return {
            output: await provider.complete(request, agent, route),
            agentKey: agent.key,
            providerKey: route.providerKey,
            model: route.model,
            attempts,
          };
        } catch {
          // A failed route is an expected fallback condition; no secret/error is exposed.
        }
      }
    }
    throw new AiRoutingUnavailableError('All eligible AI routes failed');
  }
}
