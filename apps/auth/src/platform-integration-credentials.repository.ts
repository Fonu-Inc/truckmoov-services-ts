export type IntegrationHealthStatus = 'connected' | 'degraded' | 'not_configured' | 'failed';

export type StoredPlatformIntegrationCredential = {
  serviceKey: string;
  category: string;
  enabled: boolean;
  secretCiphertext: string | null;
  secretPreview: string | null;
  config: Record<string, unknown>;
  status: IntegrationHealthStatus;
  lastTestedAt: string | null;
  lastError: string | null;
  updatedAt: string;
};

export type PlatformIntegrationCredentialView = Omit<
  StoredPlatformIntegrationCredential,
  'secretCiphertext' | 'category' | 'updatedAt'
> & {
  /** Both null on a service nobody has configured yet. */
  category: string | null;
  updatedAt: string | null;
  /** A secret is held. The secret itself is never returned by any read. */
  configured: boolean;
};

export function toIntegrationCredentialView(
  value: StoredPlatformIntegrationCredential,
): PlatformIntegrationCredentialView {
  const { secretCiphertext, ...view } = value;
  return { ...view, configured: secretCiphertext !== null };
}

/**
 * What a service that has never been configured looks like.
 *
 * Read as a 200 rather than a 404: "no key has been set yet" is a state the
 * settings page has to render, not a failed lookup.
 */
export function unconfiguredIntegrationCredentialView(
  serviceKey: string,
): PlatformIntegrationCredentialView {
  return {
    serviceKey,
    category: null,
    enabled: false,
    secretPreview: null,
    config: {},
    status: 'not_configured',
    lastTestedAt: null,
    lastError: null,
    updatedAt: null,
    configured: false,
  };
}

export interface PlatformIntegrationCredentialsRepository {
  list(): Promise<StoredPlatformIntegrationCredential[]>;
  findByServiceKey(serviceKey: string): Promise<StoredPlatformIntegrationCredential | null>;
  save(value: StoredPlatformIntegrationCredential): Promise<void>;
}

export const PLATFORM_INTEGRATION_CREDENTIALS_REPOSITORY = Symbol(
  'PLATFORM_INTEGRATION_CREDENTIALS_REPOSITORY',
);

export class PlatformIntegrationCredentialStorageError extends Error {
  readonly cause: unknown;

  constructor(operation: 'list' | 'find' | 'save', cause: unknown) {
    super(`Could not ${operation} platform integration credentials`);
    this.name = 'PlatformIntegrationCredentialStorageError';
    this.cause = cause;
  }
}
