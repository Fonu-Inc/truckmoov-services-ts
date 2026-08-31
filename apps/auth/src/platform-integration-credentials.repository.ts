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

export type PlatformIntegrationCredentialView = Omit<StoredPlatformIntegrationCredential, 'secretCiphertext'>;

export function toIntegrationCredentialView(
  value: StoredPlatformIntegrationCredential,
): PlatformIntegrationCredentialView {
  const { secretCiphertext: _secret, ...view } = value;
  return view;
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
