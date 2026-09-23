import { Inject, Injectable } from '@nestjs/common';
import { AppConfigService } from '@shared/config';
import { SecretCipherService, generateTotpSecret, totpEnrolmentUri, verifyTotp } from '@shared/crypto';
import { AuthUser } from './contexts/auth/session/domain/entities/auth-user.entity';
import { USER_REPOSITORY } from './contexts/auth/session';
import { LoginUseCase, type LoginCommand } from './contexts/auth/session/application/use-cases/login.use-case';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import { issueChallengeToken, readChallengeToken } from './two-factor-login';
import { TWO_FACTOR_REPOSITORY, type TwoFactorRepository } from './two-factor.repository';
import { InvalidTwoFactorCodeError, consumeRecoveryCode, hashRecoveryCode, mintRecoveryCode } from './two-factor.use-cases';

const AUDIENCE = 'admin-login';
const RECOVERY_CODES = 8;
const ISSUER = 'TruckMoov';

export class InvalidChallengeError extends Error {
  constructor() {
    super('This sign-in has expired; start again');
  }
}

type Session = Awaited<ReturnType<LoginUseCase['issueSession']>>;

export type AdminLoginStart =
  | { kind: 'session'; session: Session }
  | { kind: 'code'; challengeToken: string }
  | { kind: 'enrolment'; challengeToken: string; secret: string; otpauthUri: string };

/**
 * Admin sign-in with a second factor, which the admin portal cannot leave
 * optional. The password alone yields a short-lived challenge, never a
 * session. Someone who has never set up an authenticator is enrolled in the
 * same step, so an admin is never locked out by the requirement itself.
 */
@Injectable()
export class AdminTwoFactorLogin {
  constructor(
    @Inject(LoginUseCase) private readonly login: LoginUseCase,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(TWO_FACTOR_REPOSITORY) private readonly enrolments: TwoFactorRepository,
    @Inject(SecretCipherService) private readonly cipher: SecretCipherService,
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  async start(command: LoginCommand): Promise<AdminLoginStart> {
    const user = await this.login.verifyForAudience(command, 'system');
    if (!this.config.adminTwoFactorRequired) return { kind: 'session', session: await this.login.issueSession(user) };

    const challengeToken = issueChallengeToken({ userId: user.id, audience: AUDIENCE }, this.config.auth.jwtSecret);
    const enrolment = await this.enrolments.findByUserId(user.id);
    if (enrolment && enrolment.confirmedAt !== null) return { kind: 'code', challengeToken };

    const secret = generateTotpSecret();
    const now = new Date();
    await this.enrolments.save({
      userId: user.id,
      secretCiphertext: this.cipher.encrypt(secret).ciphertext,
      confirmedAt: null,
      recoveryCodeHashes: [],
      createdAt: enrolment?.createdAt ?? now,
      updatedAt: now,
    });
    return {
      kind: 'enrolment',
      challengeToken,
      secret,
      otpauthUri: totpEnrolmentUri({ secret, accountName: user.email, issuer: ISSUER }),
    };
  }

  /** The code from the authenticator, or a recovery code, completes the sign-in. */
  async complete(challengeToken: string, code: string): Promise<Session & { recoveryCodes?: string[] }> {
    const challenge = readChallengeToken(challengeToken, this.config.auth.jwtSecret);
    if (!challenge || challenge.audience !== AUDIENCE) throw new InvalidChallengeError();
    const stored = await this.users.findById(challenge.userId);
    const enrolment = await this.enrolments.findByUserId(challenge.userId);
    if (!stored || stored.accountStatus === 'disabled' || !enrolment) throw new InvalidChallengeError();

    const secret = this.cipher.decrypt(enrolment.secretCiphertext);
    const user = AuthUser.create({ id: stored.id, email: stored.email, role: stored.role, tenantId: stored.tenantId });

    if (enrolment.confirmedAt === null) {
      if (!verifyTotp(secret, code)) throw new InvalidTwoFactorCodeError();
      const recoveryCodes = Array.from({ length: RECOVERY_CODES }, mintRecoveryCode);
      await this.enrolments.save({ ...enrolment, confirmedAt: new Date(), recoveryCodeHashes: recoveryCodes.map(hashRecoveryCode), updatedAt: new Date() });
      return { ...(await this.login.issueSession(user)), recoveryCodes };
    }

    if (!verifyTotp(secret, code)) {
      const remaining = consumeRecoveryCode(code, enrolment.recoveryCodeHashes);
      if (!remaining) throw new InvalidTwoFactorCodeError();
      await this.enrolments.save({ ...enrolment, recoveryCodeHashes: remaining, updatedAt: new Date() });
    }
    return this.login.issueSession(user);
  }
}
