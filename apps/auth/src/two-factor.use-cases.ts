import { Inject, Injectable } from '@nestjs/common';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { SecretCipherService } from '@shared/crypto';
import { generateTotpSecret, totpEnrolmentUri, verifyTotp } from '@shared/crypto';
import { TOKEN_SERVICE, USER_REPOSITORY } from './contexts/auth/session';
import { resolveActorUser } from './contexts/auth/session/application/use-cases/support/resolve-actor-user';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import {
  isTwoFactorActive,
  TWO_FACTOR_REPOSITORY,
  type TwoFactorRepository,
} from './two-factor.repository';
import {
  SYSTEM_SETTINGS_REPOSITORY,
  type SystemSettingsRepository,
} from './system-settings.repository';

const RECOVERY_CODE_COUNT = 8;
const ISSUER = 'TruckMoov';

export class TwoFactorAlreadyEnrolledError extends Error {
  constructor() {
    super('Two-factor is already set up for this account');
  }
}

export class TwoFactorNotEnrolledError extends Error {
  constructor() {
    super('Two-factor has not been set up for this account');
  }
}

export class InvalidTwoFactorCodeError extends Error {
  constructor() {
    super('That code is not valid');
  }
}

export class TwoFactorRequiredError extends Error {
  constructor() {
    super('Two-factor is required for this account and cannot be turned off');
  }
}

/**
 * Starts enrolment. Returns the secret once, as a QR-scannable URI.
 *
 * The enrolment is stored unconfirmed: until a correct code proves the
 * authenticator was actually set up, the account is not treated as protected.
 * Enrolling and then closing the tab must not lock anybody out.
 */
@Injectable()
export class BeginTwoFactorEnrolmentUseCase {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(TWO_FACTOR_REPOSITORY) private readonly repository: TwoFactorRepository,
    @Inject(SecretCipherService) private readonly cipher: SecretCipherService,
  ) {}

  async execute(accessToken: string) {
    const actor = await resolveActorUser(accessToken, this.tokenService, this.users);

    const existing = await this.repository.findByUserId(actor.id);
    if (existing !== null && existing.confirmedAt !== null) {
      throw new TwoFactorAlreadyEnrolledError();
    }

    const secret = generateTotpSecret();
    const now = new Date();
    await this.repository.save({
      userId: actor.id,
      secretCiphertext: this.cipher.encrypt(secret).ciphertext,
      confirmedAt: null,
      // Issued at confirmation, not now: codes shown before the app is proven
      // to work would be written down for an enrolment that never completed.
      recoveryCodeHashes: [],
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    });

    return {
      status: true,
      message: 'Scan this with your authenticator app, then confirm a code',
      data: {
        // The only time either is readable. Neither is stored in the clear.
        secret,
        otpauthUri: totpEnrolmentUri({ secret, accountName: actor.email, issuer: ISSUER }),
      },
    };
  }
}

@Injectable()
export class ConfirmTwoFactorEnrolmentUseCase {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(TWO_FACTOR_REPOSITORY) private readonly repository: TwoFactorRepository,
    @Inject(SecretCipherService) private readonly cipher: SecretCipherService,
  ) {}

  async execute(accessToken: string, code: string) {
    const actor = await resolveActorUser(accessToken, this.tokenService, this.users);

    const enrolment = await this.repository.findByUserId(actor.id);
    if (!enrolment) throw new TwoFactorNotEnrolledError();
    if (enrolment.confirmedAt !== null) throw new TwoFactorAlreadyEnrolledError();

    const secret = this.cipher.decrypt(enrolment.secretCiphertext);
    if (!verifyTotp(secret, code)) throw new InvalidTwoFactorCodeError();

    const recoveryCodes = Array.from({ length: RECOVERY_CODE_COUNT }, mintRecoveryCode);
    await this.repository.save({
      ...enrolment,
      confirmedAt: new Date(),
      recoveryCodeHashes: recoveryCodes.map(hashRecoveryCode),
      updatedAt: new Date(),
    });

    return {
      status: true,
      message: 'Two-factor is now on for this account',
      data: {
        // Shown once. Only hashes are kept, so they cannot be listed again.
        recoveryCodes,
      },
    };
  }
}

@Injectable()
export class DisableTwoFactorUseCase {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(TWO_FACTOR_REPOSITORY) private readonly repository: TwoFactorRepository,
    @Inject(SecretCipherService) private readonly cipher: SecretCipherService,
    @Inject(SYSTEM_SETTINGS_REPOSITORY) private readonly settings: SystemSettingsRepository,
  ) {}

  async execute(accessToken: string, code: string) {
    const actor = await resolveActorUser(accessToken, this.tokenService, this.users);

    const enrolment = await this.repository.findByUserId(actor.id);
    if (!isTwoFactorActive(enrolment)) throw new TwoFactorNotEnrolledError();

    // A current code is required to turn it off. Otherwise a stolen session is
    // enough to remove the control that exists to contain a stolen session.
    const secret = this.cipher.decrypt(enrolment.secretCiphertext);
    if (!verifyTotp(secret, code)) throw new InvalidTwoFactorCodeError();

    const platform = await this.settings.get();
    if (platform?.security?.requireTwoFactor) throw new TwoFactorRequiredError();

    await this.repository.deleteByUserId(actor.id);
    return { status: true, message: 'Two-factor is off for this account', data: null };
  }
}

@Injectable()
export class GetTwoFactorStatusUseCase {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(TWO_FACTOR_REPOSITORY) private readonly repository: TwoFactorRepository,
    @Inject(SYSTEM_SETTINGS_REPOSITORY) private readonly settings: SystemSettingsRepository,
  ) {}

  async execute(accessToken: string) {
    const actor = await resolveActorUser(accessToken, this.tokenService, this.users);
    const [enrolment, platform] = await Promise.all([
      this.repository.findByUserId(actor.id),
      this.settings.get(),
    ]);

    return {
      status: true,
      message: 'success',
      data: {
        enrolled: isTwoFactorActive(enrolment),
        pendingConfirmation: enrolment !== null && enrolment.confirmedAt === null,
        requiredByPlatform: platform?.security?.requireTwoFactor ?? false,
        recoveryCodesRemaining: enrolment?.recoveryCodeHashes.length ?? 0,
      },
    };
  }
}

/**
 * Groups of five, so a person reading one aloud or typing it from paper does
 * not lose their place.
 */
function mintRecoveryCode(): string {
  const raw = randomBytes(8).toString('base64url').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
  return `${raw.slice(0, 5)}-${raw.slice(5, 10)}`;
}

export function hashRecoveryCode(code: string): string {
  return createHash('sha256').update(code.trim().toLowerCase()).digest('hex');
}

/**
 * Finds and consumes a recovery code, returning the remaining hashes.
 *
 * Single use: a code that has been used is removed, so a written-down list
 * cannot be replayed. Returns null when nothing matched.
 */
export function consumeRecoveryCode(
  candidate: string,
  hashes: string[],
): string[] | null {
  const target = Buffer.from(hashRecoveryCode(candidate), 'hex');
  const remaining: string[] = [];
  let matched = false;

  for (const hash of hashes) {
    const stored = Buffer.from(hash, 'hex');
    if (
      !matched
      && stored.length === target.length
      && timingSafeEqual(stored, target)
    ) {
      matched = true;
      continue;
    }
    remaining.push(hash);
  }

  return matched ? remaining : null;
}
