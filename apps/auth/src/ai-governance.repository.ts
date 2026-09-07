/**
 * Providers stay separate even though every call leaves through OpenRouter.
 *
 * One upstream credential would be simpler, but guardrails and tool access are
 * decided per provider: a model family that may not see driver names, or may
 * not call a tool, has to be describable on its own. Collapsing them into one
 * allowlist would lose that.
 */
export const AI_PROVIDERS = ['openai', 'anthropic', 'lovable'] as const;
export type AiProvider = (typeof AI_PROVIDERS)[number];

export function isAiProvider(value: string): value is AiProvider {
  return (AI_PROVIDERS as readonly string[]).includes(value);
}

/**
 * Tools an AI call may reach. Withheld by default: a model that can read the
 * fleet is a smaller problem than one that can dispatch it.
 */
export const AI_TOOLS = [
  'read_vehicles',
  'read_drivers',
  'read_jobs',
  'read_positions',
  'suggest_assignment',
] as const;
export type AiTool = (typeof AI_TOOLS)[number];

export function isAiTool(value: string): value is AiTool {
  return (AI_TOOLS as readonly string[]).includes(value);
}

export type AiProviderConfig = {
  provider: AiProvider;
  label: string;
  description: string;
  enabled: boolean;
  /**
   * Models the platform will route to, as the provider names them. Prefixed
   * with the provider for OpenRouter at call time, so what is stored stays
   * readable on the settings screen.
   */
  allowedModels: string[];
  /** Chosen when a caller names no model. Must be in `allowedModels`. */
  defaultModel: string | null;
  allowedTools: AiTool[];
};

export type AiRateLimits = {
  maxTokensPerRequest: number;
  maxRequestsPerMinute: number;
  maxTokensPerDayPerTenant: number;
};

/**
 * What is stripped from a prompt before it leaves the platform.
 *
 * Redaction happens on the way out, not on the way in: the caller assembles a
 * prompt from real records, and this is the last point at which the platform
 * still controls what a third party sees.
 */
export type AiDataProtection = {
  redactPhoneNumbers: boolean;
  redactDriverNames: boolean;
  redactVehiclePlates: boolean;
  /** Prompt and response bodies kept for debugging. Admin-only when on. */
  storePromptsAndResponses: boolean;
};

export type AiGovernanceSettings = {
  /** The master switch. Off means no AI call leaves the platform at all. */
  matchingEnabled: boolean;
  providers: AiProviderConfig[];
  rateLimits: AiRateLimits;
  dataProtection: AiDataProtection;
  updatedByUserId: string | null;
  updatedAt: Date;
};

export const AI_GOVERNANCE_ID = 'system';

export function buildDefaultAiGovernance(): AiGovernanceSettings {
  return {
    // Off by default. An AI feature that starts spending on first boot is not
    // a feature anybody asked for.
    matchingEnabled: false,
    providers: [
      {
        provider: 'openai',
        label: 'OpenAI',
        description: 'GPT-4o, GPT-5 models',
        enabled: false,
        allowedModels: ['gpt-4o', 'gpt-4o-mini', 'gpt-5', 'gpt-5-mini', 'gpt-5-nano'],
        defaultModel: 'gpt-4o-mini',
        allowedTools: ['read_vehicles', 'read_drivers', 'read_jobs', 'suggest_assignment'],
      },
      {
        provider: 'anthropic',
        label: 'Anthropic',
        description: 'Claude 3.5, Claude 3 models',
        enabled: false,
        allowedModels: [
          'claude-3.5-sonnet',
          'claude-3-sonnet',
          'claude-3-haiku',
          'claude-3-opus',
        ],
        defaultModel: 'claude-3.5-sonnet',
        allowedTools: ['read_vehicles', 'read_drivers', 'read_jobs', 'suggest_assignment'],
      },
      {
        provider: 'lovable',
        label: 'Lovable AI',
        description: 'Gemini models (Platform default)',
        enabled: false,
        allowedModels: [
          'gemini-2.5-flash',
          'gemini-2.5-pro',
          'gemini-2.5-flash-lite',
          'gemini-3-flash-preview',
        ],
        defaultModel: 'gemini-2.5-flash',
        allowedTools: ['read_vehicles', 'read_drivers', 'read_jobs', 'suggest_assignment'],
      },
    ],
    rateLimits: {
      maxTokensPerRequest: 4096,
      maxRequestsPerMinute: 60,
      maxTokensPerDayPerTenant: 1_000_000,
    },
    dataProtection: {
      // Phone numbers leave by default redacted: they are the field with the
      // least value to a matching prompt and the most to anyone else.
      redactPhoneNumbers: true,
      redactDriverNames: false,
      redactVehiclePlates: false,
      storePromptsAndResponses: false,
    },
    updatedByUserId: null,
    updatedAt: new Date(0),
  };
}

/** Fills anything a row written before a setting existed does not carry. */
export function normalizeAiGovernance(
  settings: Partial<AiGovernanceSettings> | null,
): AiGovernanceSettings {
  const defaults = buildDefaultAiGovernance();
  if (!settings) return defaults;

  const storedByProvider = new Map(
    (settings.providers ?? []).map((provider) => [provider.provider, provider]),
  );

  return {
    matchingEnabled: settings.matchingEnabled ?? defaults.matchingEnabled,
    // Driven from the known provider list, not from what is stored: a provider
    // added in code must appear even on a row written before it existed.
    providers: defaults.providers.map((fallback) => {
      const stored = storedByProvider.get(fallback.provider);
      if (!stored) return fallback;
      return {
        ...fallback,
        enabled: stored.enabled ?? fallback.enabled,
        allowedModels: stored.allowedModels?.length ? stored.allowedModels : fallback.allowedModels,
        defaultModel: stored.defaultModel ?? fallback.defaultModel,
        allowedTools: stored.allowedTools ?? fallback.allowedTools,
      };
    }),
    rateLimits: { ...defaults.rateLimits, ...(settings.rateLimits ?? {}) },
    dataProtection: { ...defaults.dataProtection, ...(settings.dataProtection ?? {}) },
    updatedByUserId: settings.updatedByUserId ?? null,
    updatedAt: settings.updatedAt ?? defaults.updatedAt,
  };
}

export interface AiGovernanceRepository {
  get(): Promise<AiGovernanceSettings | null>;
  save(settings: AiGovernanceSettings): Promise<void>;
}

export const AI_GOVERNANCE_REPOSITORY = Symbol('AI_GOVERNANCE_REPOSITORY');
