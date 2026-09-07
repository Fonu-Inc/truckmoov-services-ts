import { Inject, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import axios from 'axios';
import { AppConfigService } from '@shared/config';
import { SecretCipherService } from '@shared/crypto';
import {
  AI_GOVERNANCE_REPOSITORY,
  normalizeAiGovernance,
  type AiGovernanceRepository,
  type AiGovernanceSettings,
  type AiProvider,
  type AiProviderConfig,
  type AiTool,
} from './ai-governance.repository';
import {
  AI_REQUEST_LOG_REPOSITORY,
  type AiRequestLogRepository,
} from './ai-request-log.repository';
import { redactPrompt } from './ai-redaction';
import {
  PLATFORM_INTEGRATION_CREDENTIALS_REPOSITORY,
  type PlatformIntegrationCredentialsRepository,
} from './platform-integration-credentials.repository';

/** The one upstream. Every provider is reached through it. */
export const OPENROUTER_SERVICE_KEY = 'openrouter';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

/** Model ids OpenRouter recognises, per provider. */
const OPENROUTER_NAMESPACE: Record<AiProvider, string> = {
  openai: 'openai',
  anthropic: 'anthropic',
  // Lovable's models are Google's; OpenRouter knows them by their real vendor.
  lovable: 'google',
};

export class AiDisabledError extends Error {
  constructor() {
    super('AI is not enabled for this platform');
  }
}

export class AiProviderNotAvailableError extends Error {
  constructor(provider: string) {
    super(`AI provider ${provider} is not enabled`);
  }
}

export class AiModelNotAllowedError extends Error {
  constructor(model: string, provider: string) {
    super(`Model ${model} is not on the allowlist for ${provider}`);
  }
}

export class AiToolNotAllowedError extends Error {
  constructor(tool: string, provider: string) {
    super(`Tool ${tool} is not permitted for ${provider}`);
  }
}

export class AiRateLimitedError extends Error {
  constructor(readonly limit: 'requests_per_minute' | 'tokens_per_day', message: string) {
    super(message);
  }
}

export class AiNotConfiguredError extends Error {
  constructor() {
    super('No OpenRouter credential is configured');
  }
}

export type AiCompletionRequest = {
  tenantId: string;
  /** What is asking. Recorded so usage can be attributed to a capability. */
  feature: string;
  provider?: AiProvider;
  model?: string;
  systemPrompt: string;
  userPrompt: string;
  tools?: AiTool[];
  maxTokens?: number;
};

export type AiCompletionResult = {
  requestId: string;
  provider: AiProvider;
  model: string;
  content: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  latencyMs: number;
};

/**
 * The only way an AI call leaves the platform.
 *
 * Every guardrail on the settings screen is enforced here rather than by the
 * caller: the master switch, the provider and model allowlists, tool access,
 * both rate limits, redaction, and the usage record. A caller that reached
 * OpenRouter directly would bypass all of it, which is why nothing else holds
 * the credential.
 */
@Injectable()
export class AiGatewayService {
  private readonly logger = new Logger(AiGatewayService.name);

  constructor(
    @Inject(AI_GOVERNANCE_REPOSITORY) private readonly governance: AiGovernanceRepository,
    @Inject(AI_REQUEST_LOG_REPOSITORY) private readonly log: AiRequestLogRepository,
    @Inject(PLATFORM_INTEGRATION_CREDENTIALS_REPOSITORY)
    private readonly credentials: PlatformIntegrationCredentialsRepository,
    @Inject(SecretCipherService) private readonly cipher: SecretCipherService,
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  async complete(request: AiCompletionRequest): Promise<AiCompletionResult> {
    const settings = normalizeAiGovernance(await this.governance.get());
    if (!settings.matchingEnabled) throw new AiDisabledError();

    const provider = this.resolveProvider(settings, request.provider);
    const model = this.resolveModel(provider, request.model);
    this.assertToolsAllowed(provider, request.tools ?? []);
    await this.assertWithinRateLimits(settings, request.tenantId);

    const apiKey = await this.apiKey();
    const maxTokens = Math.min(
      request.maxTokens ?? settings.rateLimits.maxTokensPerRequest,
      settings.rateLimits.maxTokensPerRequest,
    );

    const prompt = redactPrompt(request.userPrompt, settings.dataProtection);
    const startedAt = Date.now();

    try {
      const response = await axios.post<OpenRouterResponse>(
        OPENROUTER_URL,
        {
          model: `${OPENROUTER_NAMESPACE[provider.provider]}/${model}`,
          messages: [
            { role: 'system', content: request.systemPrompt },
            { role: 'user', content: prompt },
          ],
          max_tokens: maxTokens,
        },
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: this.config.ai.timeoutMs,
          validateStatus: () => true,
        },
      );

      const latencyMs = Date.now() - startedAt;
      if (response.status < 200 || response.status >= 300) {
        const message = response.data?.error?.message ?? `OpenRouter returned ${response.status}`;
        await this.record(request, provider.provider, model, null, latencyMs, false, message, prompt, settings);
        throw new Error(message);
      }

      const content = response.data?.choices?.[0]?.message?.content ?? '';
      const usage = response.data?.usage ?? null;
      await this.record(request, provider.provider, model, usage, latencyMs, true, null, prompt, settings, content);

      return {
        requestId: randomUUID(),
        provider: provider.provider,
        model,
        content,
        promptTokens: usage?.prompt_tokens ?? 0,
        completionTokens: usage?.completion_tokens ?? 0,
        totalTokens: usage?.total_tokens ?? 0,
        latencyMs,
      };
    } catch (error) {
      if (error instanceof AiRateLimitedError) throw error;
      const latencyMs = Date.now() - startedAt;
      const message = error instanceof Error ? error.message : 'unknown';
      // Recorded whichever way it failed, so the success rate on the usage tab
      // is a real rate and not a count of the calls that happened to work.
      await this.record(request, provider.provider, model, null, latencyMs, false, message, prompt, settings);
      throw error;
    }
  }

  private resolveProvider(
    settings: AiGovernanceSettings,
    wanted: AiProvider | undefined,
  ): AiProviderConfig {
    const enabled = settings.providers.filter((provider) => provider.enabled);
    if (enabled.length === 0) throw new AiProviderNotAvailableError(wanted ?? 'any');

    if (!wanted) return enabled[0];
    const chosen = enabled.find((provider) => provider.provider === wanted);
    if (!chosen) throw new AiProviderNotAvailableError(wanted);
    return chosen;
  }

  private resolveModel(provider: AiProviderConfig, wanted: string | undefined): string {
    if (!wanted) {
      const fallback = provider.defaultModel ?? provider.allowedModels[0];
      if (!fallback) throw new AiModelNotAllowedError('(none)', provider.provider);
      return fallback;
    }
    if (!provider.allowedModels.includes(wanted)) {
      throw new AiModelNotAllowedError(wanted, provider.provider);
    }
    return wanted;
  }

  private assertToolsAllowed(provider: AiProviderConfig, tools: AiTool[]): void {
    for (const tool of tools) {
      if (!provider.allowedTools.includes(tool)) {
        throw new AiToolNotAllowedError(tool, provider.provider);
      }
    }
  }

  /**
   * Both ceilings are per tenant. A platform-wide limit would let one busy
   * fleet exhaust the allowance every other tenant is paying for.
   */
  private async assertWithinRateLimits(
    settings: AiGovernanceSettings,
    tenantId: string,
  ): Promise<void> {
    const minuteAgo = new Date(Date.now() - 60_000);
    const requests = await this.log.countSince(tenantId, minuteAgo);
    if (requests >= settings.rateLimits.maxRequestsPerMinute) {
      throw new AiRateLimitedError(
        'requests_per_minute',
        `This tenant has made ${requests} AI requests in the last minute, and the limit is ${settings.rateLimits.maxRequestsPerMinute}`,
      );
    }

    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const tokens = await this.log.tokensSince(tenantId, dayAgo);
    if (tokens >= settings.rateLimits.maxTokensPerDayPerTenant) {
      throw new AiRateLimitedError(
        'tokens_per_day',
        `This tenant has used ${tokens} tokens today, and the daily limit is ${settings.rateLimits.maxTokensPerDayPerTenant}`,
      );
    }
  }

  private async apiKey(): Promise<string> {
    const credential = await this.credentials.findByServiceKey(OPENROUTER_SERVICE_KEY);
    if (!credential?.enabled || !credential.secretCiphertext) throw new AiNotConfiguredError();
    return this.cipher.decrypt(credential.secretCiphertext);
  }

  private async record(
    request: AiCompletionRequest,
    provider: AiProvider,
    model: string,
    usage: OpenRouterUsage | null,
    latencyMs: number,
    succeeded: boolean,
    errorMessage: string | null,
    prompt: string,
    settings: AiGovernanceSettings,
    response?: string,
  ): Promise<void> {
    try {
      await this.log.record({
        id: randomUUID(),
        tenantId: request.tenantId,
        provider,
        model,
        feature: request.feature,
        promptTokens: usage?.prompt_tokens ?? 0,
        completionTokens: usage?.completion_tokens ?? 0,
        totalTokens: usage?.total_tokens ?? 0,
        latencyMs,
        succeeded,
        errorMessage,
        // Bodies are kept only while the setting is on, and the prompt stored
        // is the redacted one that was actually sent.
        promptBody: settings.dataProtection.storePromptsAndResponses ? prompt : null,
        responseBody: settings.dataProtection.storePromptsAndResponses ? (response ?? null) : null,
        createdAt: new Date(),
      });
    } catch (error) {
      // Losing the usage row must not fail a call that already succeeded.
      this.logger.warn(
        `ai_usage_record_failed:${request.tenantId}:${error instanceof Error ? error.message : 'unknown'}`,
      );
    }
  }
}

type OpenRouterUsage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
};

type OpenRouterResponse = {
  choices?: Array<{ message?: { content?: string } }>;
  usage?: OpenRouterUsage;
  error?: { message?: string };
};
