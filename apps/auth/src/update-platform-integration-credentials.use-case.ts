import { Inject, Injectable, Logger } from '@nestjs/common';
import { SecretCipherService, SecretCipherNotConfiguredError } from '@shared/crypto';
import { ActivityLogService } from './activity-log.service';
import { TOKEN_SERVICE, USER_REPOSITORY } from './contexts/auth/session';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import { ensureSystemActor, SYSTEM_MUTATOR_ROLES } from './system-authz';
import {
  PLATFORM_INTEGRATION_CREDENTIALS_REPOSITORY,
  toIntegrationCredentialView,
  type PlatformIntegrationCredentialView,
  type PlatformIntegrationCredentialsRepository,
  PlatformIntegrationCredentialStorageError,
} from './platform-integration-credentials.repository';

export type UpdatePlatformIntegrationCredentialsCommand = {
  accessToken: string;
  serviceKey: string;
  category: string;
  enabled: boolean;
  secret?: string;
  config?: Record<string, unknown>;
};

export class IntegrationCredentialKeyError extends Error {
  constructor() { super('serviceKey and category are required'); }
}

export class IntegrationCredentialSecretError extends Error {
  readonly cause: unknown;

  constructor(cause: unknown) {
    super('Integration secret could not be encrypted');
    this.name = 'IntegrationCredentialSecretError';
    this.cause = cause;
  }
}

@Injectable()
export class UpdatePlatformIntegrationCredentialsUseCase {
  private readonly logger = new Logger(UpdatePlatformIntegrationCredentialsUseCase.name);
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(PLATFORM_INTEGRATION_CREDENTIALS_REPOSITORY)
    private readonly repository: PlatformIntegrationCredentialsRepository,
    @Inject(SecretCipherService) private readonly cipher: SecretCipherService,
    @Inject(ActivityLogService) private readonly activity: ActivityLogService,
  ) {}

  async list(accessToken: string): Promise<PlatformIntegrationCredentialView[]> {
    await this.authorize(accessToken);
    try {
      return (await this.repository.list()).map(toIntegrationCredentialView);
    } catch (error) {
      this.logStorageFailure('list', error);
      throw error;
    }
  }

  async update(command: UpdatePlatformIntegrationCredentialsCommand): Promise<PlatformIntegrationCredentialView> {
    const actor = await this.authorize(command.accessToken);
    const serviceKey = command.serviceKey.trim().toLowerCase();
    const category = command.category.trim().toLowerCase();
    if (!serviceKey || !category) throw new IntegrationCredentialKeyError();
    const existing = await this.repository.findByServiceKey(serviceKey);
    let encrypted: ReturnType<SecretCipherService['encrypt']> | null = null;
    try {
      encrypted = command.secret?.trim() ? this.cipher.encrypt(command.secret.trim()) : null;
    } catch (error) {
      if (error instanceof SecretCipherNotConfiguredError) throw error;
      throw new IntegrationCredentialSecretError(error);
    }
    const value = {
      serviceKey,
      category,
      enabled: command.enabled,
      secretCiphertext: encrypted?.ciphertext ?? existing?.secretCiphertext ?? null,
      secretPreview: encrypted?.preview ?? existing?.secretPreview ?? null,
      config: command.config ?? existing?.config ?? {},
      status: command.enabled && (encrypted?.ciphertext || existing?.secretCiphertext)
        ? 'degraded' as const : 'not_configured' as const,
      lastTestedAt: null,
      lastError: null,
      updatedAt: new Date().toISOString(),
    };
    try {
      await this.repository.save(value);
    } catch (error) {
      this.logStorageFailure('save', error);
      throw error;
    }
    await this.activity.record({
      tenantId: 'system', actorId: actor.id, actorRole: actor.role,
      service: 'auth', action: 'platform_integration.credentials_changed',
      entityType: 'platform_integration', entityId: serviceKey,
      summary: `Platform integration credentials changed for ${serviceKey}`,
      metadata: { category, enabled: command.enabled, secretChanged: Boolean(encrypted) },
    });
    return toIntegrationCredentialView(value);
  }

  private async authorize(accessToken: string) {
    return ensureSystemActor(accessToken, this.tokenService, this.users, {
      allowedRoles: SYSTEM_MUTATOR_ROLES,
      forbiddenMessage: 'Only platform administrators can manage integration credentials',
    });
  }

  private logStorageFailure(operation: string, error: unknown): void {
    const safeError = error instanceof PlatformIntegrationCredentialStorageError
      ? error.message
      : 'unexpected storage error';
    this.logger.error(`platform_integration_${operation}_failed:${safeError}`);
  }
}
