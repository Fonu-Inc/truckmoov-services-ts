import { Inject, Injectable } from '@nestjs/common';
import { TOKEN_SERVICE, USER_REPOSITORY } from './contexts/auth/session';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import { ensureSystemActor, SYSTEM_MUTATOR_ROLES } from './system-authz';
import {
  AI_GOVERNANCE_REPOSITORY,
  AI_TOOLS,
  isAiProvider,
  isAiTool,
  normalizeAiGovernance,
  type AiGovernanceRepository,
  type AiGovernanceSettings,
  type AiProviderConfig,
} from './ai-governance.repository';
import {
  AI_REQUEST_LOG_REPOSITORY,
  type AiRequestLogRepository,
} from './ai-request-log.repository';

export class InvalidAiSettingsError extends Error {}

export type UpdateAiGovernanceCommand = {
  accessToken: string;
  matchingEnabled?: boolean;
  providers?: Array<{
    provider: string;
    enabled?: boolean;
    allowedModels?: string[];
    defaultModel?: string | null;
    allowedTools?: string[];
  }>;
  rateLimits?: {
    maxTokensPerRequest?: number;
    maxRequestsPerMinute?: number;
    maxTokensPerDayPerTenant?: number;
  };
  dataProtection?: {
    redactPhoneNumbers?: boolean;
    redactDriverNames?: boolean;
    redactVehiclePlates?: boolean;
    storePromptsAndResponses?: boolean;
  };
};

@Injectable()
export class GetAiGovernanceUseCase {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(AI_GOVERNANCE_REPOSITORY) private readonly repository: AiGovernanceRepository,
  ) {}

  async execute(accessToken: string) {
    await ensureSystemActor(accessToken, this.tokenService, this.userRepository, {
      forbiddenMessage: 'You are not permitted to view AI settings',
    });

    const settings = normalizeAiGovernance(await this.repository.get());
    return {
      status: true,
      message: 'success',
      data: {
        matchingEnabled: settings.matchingEnabled,
        providers: settings.providers,
        rateLimits: settings.rateLimits,
        dataProtection: settings.dataProtection,
        // Offered so the screen can render the tool checkboxes without a
        // hardcoded list that drifts from what the gateway enforces.
        availableTools: [...AI_TOOLS],
        updatedAt: settings.updatedAt.toISOString(),
        updatedByUserId: settings.updatedByUserId,
      },
    };
  }
}

@Injectable()
export class UpdateAiGovernanceUseCase {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(AI_GOVERNANCE_REPOSITORY) private readonly repository: AiGovernanceRepository,
  ) {}

  async execute(command: UpdateAiGovernanceCommand) {
    const actor = await ensureSystemActor(
      command.accessToken,
      this.tokenService,
      this.userRepository,
      {
        allowedRoles: SYSTEM_MUTATOR_ROLES,
        forbiddenMessage: 'You are not permitted to change AI settings',
      },
    );

    const current = normalizeAiGovernance(await this.repository.get());
    const next: AiGovernanceSettings = {
      matchingEnabled: command.matchingEnabled ?? current.matchingEnabled,
      providers: this.mergeProviders(current.providers, command.providers),
      rateLimits: {
        maxTokensPerRequest: positive(
          command.rateLimits?.maxTokensPerRequest,
          current.rateLimits.maxTokensPerRequest,
          'maxTokensPerRequest',
        ),
        maxRequestsPerMinute: positive(
          command.rateLimits?.maxRequestsPerMinute,
          current.rateLimits.maxRequestsPerMinute,
          'maxRequestsPerMinute',
        ),
        maxTokensPerDayPerTenant: positive(
          command.rateLimits?.maxTokensPerDayPerTenant,
          current.rateLimits.maxTokensPerDayPerTenant,
          'maxTokensPerDayPerTenant',
        ),
      },
      dataProtection: { ...current.dataProtection, ...(command.dataProtection ?? {}) },
      updatedByUserId: actor.id,
      updatedAt: new Date(),
    };

    await this.repository.save(next);
    return { status: true, message: 'AI settings updated', data: next };
  }

  private mergeProviders(
    current: AiProviderConfig[],
    patches: UpdateAiGovernanceCommand['providers'],
  ): AiProviderConfig[] {
    if (!patches) return current;

    for (const patch of patches) {
      if (!isAiProvider(patch.provider)) {
        throw new InvalidAiSettingsError(`Unknown AI provider: ${patch.provider}`);
      }
      for (const tool of patch.allowedTools ?? []) {
        if (!isAiTool(tool)) {
          throw new InvalidAiSettingsError(`Unknown AI tool: ${tool}`);
        }
      }
    }

    const byProvider = new Map(patches.map((patch) => [patch.provider, patch]));

    return current.map((provider) => {
      const patch = byProvider.get(provider.provider);
      if (!patch) return provider;

      const allowedModels = patch.allowedModels ?? provider.allowedModels;
      if (allowedModels.length === 0) {
        throw new InvalidAiSettingsError(
          `${provider.label} needs at least one allowed model, or should be disabled instead`,
        );
      }

      const defaultModel =
        patch.defaultModel === undefined ? provider.defaultModel : patch.defaultModel;
      // A default outside the allowlist would be chosen and then refused on
      // every call that named no model.
      if (defaultModel !== null && !allowedModels.includes(defaultModel)) {
        throw new InvalidAiSettingsError(
          `${defaultModel} cannot be the default for ${provider.label} while it is not an allowed model`,
        );
      }

      return {
        ...provider,
        enabled: patch.enabled ?? provider.enabled,
        allowedModels,
        defaultModel,
        allowedTools: (patch.allowedTools as AiProviderConfig['allowedTools']) ?? provider.allowedTools,
      };
    });
  }
}

@Injectable()
export class GetAiUsageUseCase {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(AI_REQUEST_LOG_REPOSITORY) private readonly log: AiRequestLogRepository,
  ) {}

  async execute(accessToken: string, from?: Date, to?: Date) {
    await ensureSystemActor(accessToken, this.tokenService, this.userRepository, {
      forbiddenMessage: 'You are not permitted to view AI usage',
    });

    const [totals, byProvider, byTenant] = await Promise.all([
      this.log.totals(from, to),
      this.log.byProvider(from, to),
      this.log.byTenant(from, to),
    ]);

    const totalTokens = totals.totalTokens;
    return {
      status: true,
      message: 'success',
      data: {
        ...totals,
        byProvider,
        // The share column on the tenant table. Computed here so every client
        // shows the same rounding.
        byTenant: byTenant.map((tenant) => ({
          ...tenant,
          percentOfTotal:
            totalTokens === 0 ? 0 : Math.round((tenant.tokens / totalTokens) * 1000) / 10,
        })),
        generatedAt: new Date().toISOString(),
      },
    };
  }
}

@Injectable()
export class ListAiRequestsUseCase {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(AI_REQUEST_LOG_REPOSITORY) private readonly log: AiRequestLogRepository,
  ) {}

  async execute(
    accessToken: string,
    filters: { search?: string; provider?: string; status?: string; limit?: number },
  ) {
    await ensureSystemActor(accessToken, this.tokenService, this.userRepository, {
      forbiddenMessage: 'You are not permitted to view AI requests',
    });

    const requests = await this.log.findAll({
      search: filters.search,
      provider: filters.provider,
      succeeded: statusToSucceeded(filters.status),
      limit: filters.limit,
    });

    return {
      status: true,
      message: 'success',
      data: {
        total: requests.length,
        items: requests.map((request) => ({
          id: request.id,
          tenantId: request.tenantId,
          provider: request.provider,
          model: request.model,
          feature: request.feature,
          tokens: request.totalTokens,
          latencyMs: request.latencyMs,
          succeeded: request.succeeded,
          errorMessage: request.errorMessage,
          createdAt: request.createdAt.toISOString(),
        })),
      },
    };
  }
}

function statusToSucceeded(status?: string): boolean | undefined {
  if (!status || status === 'all') return undefined;
  if (status === 'success') return true;
  if (status === 'failed') return false;
  return undefined;
}

function positive(value: number | undefined, fallback: number, field: string): number {
  if (value === undefined) return fallback;
  if (!Number.isInteger(value) || value <= 0) {
    throw new InvalidAiSettingsError(`${field} must be a positive whole number`);
  }
  return value;
}
