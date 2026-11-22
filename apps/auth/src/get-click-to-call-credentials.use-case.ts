import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TOKEN_SERVICE, USER_REPOSITORY } from './contexts/auth/session';
import { resolveActorUser } from './contexts/auth/session/application/use-cases/support/resolve-actor-user';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';

const FONU_AUTHORIZE_URL = 'https://api.fonucx.com/api/v1/external-integrations/authorize-sdk';
const FONU_TIMEOUT_MS = 10_000;
const CACHE_TTL_MS = 5 * 60_000;

export type ClickToCallCredentials = Record<string, unknown>;

export class ClickToCallNotConfiguredError extends Error {
  constructor() {
    super('Click-to-call is not configured');
  }
}

export class ClickToCallUnavailableError extends Error {
  constructor() {
    super('Click-to-call is unavailable right now');
  }
}

/** Fonu's SDK key stays here; the browser only gets the clickToCall block it returns. */
@Injectable()
export class GetClickToCallCredentialsUseCase {
  private cached: { value: ClickToCallCredentials; expiresAt: number } | null = null;

  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(ConfigService) private readonly config: ConfigService,
  ) {}

  async execute(accessToken: string): Promise<ClickToCallCredentials> {
    await resolveActorUser(accessToken, this.tokenService, this.userRepository);

    const companyUuid = this.config.get<string>('FONU_COMPANY_UUID', '');
    const apiKey = this.config.get<string>('FONU_API_KEY', '');
    if (!companyUuid || !apiKey) throw new ClickToCallNotConfiguredError();

    if (this.cached && this.cached.expiresAt > Date.now()) return this.cached.value;

    let body: { clickToCall?: ClickToCallCredentials; data?: { clickToCall?: ClickToCallCredentials } };
    try {
      const response = await fetch(FONU_AUTHORIZE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyUuid, apiKey }),
        signal: AbortSignal.timeout(FONU_TIMEOUT_MS),
      });
      if (!response.ok) throw new ClickToCallUnavailableError();
      body = (await response.json()) as typeof body;
    } catch {
      throw new ClickToCallUnavailableError();
    }

    const clickToCall = body?.clickToCall ?? body?.data?.clickToCall;
    if (!clickToCall) throw new ClickToCallUnavailableError();
    this.cached = { value: clickToCall, expiresAt: Date.now() + CACHE_TTL_MS };
    return clickToCall;
  }
}
