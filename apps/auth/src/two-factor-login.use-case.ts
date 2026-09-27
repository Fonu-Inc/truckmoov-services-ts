import { Inject, Injectable } from '@nestjs/common';
import { AppConfigService } from '@shared/config';
import { SecretCipherService, generateTotpSecret, matchTotpStep, totpEnrolmentUri } from '@shared/crypto';
import { AuthUser } from './contexts/auth/session/domain/entities/auth-user.entity';
import { USER_REPOSITORY } from './contexts/auth/session';
import {
  LoginUseCase,
  type LoginAudience,
  type LoginCommand,
} from './contexts/auth/session/application/use-cases/login.use-case';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import { issueChallengeToken, readChallengeToken } from './two-factor-login';
import { checkCodeAttempt } from './two-factor-attempts';
import {
  TWO_FACTOR_REPOSITORY,
  isTwoFactorActive,
  type StoredTwoFactorEnrolment,
  type TwoFactorRepository,
} from './two-factor.repository';
import {
  InvalidTwoFactorCodeError,
  RECOVERY_CODE_COUNT,
  TOTP_ISSUER,
  consumeRecoveryCode,
  hashRecoveryCode,
  mintRecoveryCode,
} from './two-factor.use-cases';

/** A challenge names its portal, so one portal's challenge cannot finish another's sign-in. */
const CHALLENGE_AUDIENCES: Record<LoginAudience, string> = {
  system: 'admin-login',
  tenant: 'tenant-login',
  installer: 'installer-login',
};

export class InvalidChallengeError extends Error {
  constructor() {
    super('This sign-in has expired; start again');
  }
}

/** A wrong code against a genuine challenge, carrying whose sign-in it was for the audit trail. */
export class LoginCodeRefusedError extends InvalidTwoFactorCodeError {
  constructor(readonly user: AuthUser) {
    super();
  }
}

export type Session = Awaited<ReturnType<LoginUseCase['issueSession']>>;
export type SecondFactor = 'authenticator' | 'recovery_code' | 'enrolment';

export type LoginStart =
  | { kind: 'session'; session: Session }
  | { kind: 'code'; challengeToken: string }
  | { kind: 'enrolment'; challengeToken: string; secret: string; otpauthUri: string };

type AcceptedCode = { changes: Partial<StoredTwoFactorEnrolment>; secondFactor: SecondFactor };
export type VerifiedLogin = { user: AuthUser; secondFactor: SecondFactor; recoveryCodes?: string[] };
export type CompletedLogin = { session: Session & { recoveryCodes?: string[] }; secondFactor: SecondFactor };

/**
 * Sign-in with a second factor, for every portal. Someone who turned
 * two-factor on gets a short-lived challenge from the password, never a
 * session. On the admin portal the platform can also require it: an admin who
 * never set up an authenticator is enrolled in the same step, so the
 * requirement itself locks nobody out.
 */
@Injectable()
export class TwoFactorLogin {
  constructor(
    @Inject(LoginUseCase) private readonly login: LoginUseCase,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(TWO_FACTOR_REPOSITORY) private readonly enrolments: TwoFactorRepository,
    @Inject(SecretCipherService) private readonly cipher: SecretCipherService,
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  async start(audience: LoginAudience, command: LoginCommand): Promise<LoginStart> {
    return this.begin(audience, await this.login.verifyForAudience(command, audience));
  }

  /** For a user whose password and portal were already checked. */
  async begin(audience: LoginAudience, user: AuthUser): Promise<LoginStart> {
    const enrolment = await this.enrolments.findByUserId(user.id);
    if (isTwoFactorActive(enrolment)) return { kind: 'code', challengeToken: this.challengeFor(audience, enrolment) };
    if (audience === 'system' && this.config.adminTwoFactorRequired) return this.enrolAtSignIn(user, enrolment);
    return { kind: 'session', session: await this.login.issueSession(user) };
  }

  async complete(audience: LoginAudience, challengeToken: string, code: string): Promise<CompletedLogin> {
    const { user, secondFactor, recoveryCodes } = await this.verify(audience, challengeToken, code);
    const session = await this.login.issueSession(user);
    return { session: recoveryCodes ? { ...session, recoveryCodes } : session, secondFactor };
  }

  /** Checks the challenge and the code, and spends the challenge. Opens no session. */
  async verify(audience: LoginAudience, challengeToken: string, code: string): Promise<VerifiedLogin> {
    const challenge = readChallengeToken(challengeToken, this.config.auth.jwtSecret);
    if (!challenge || challenge.audience !== CHALLENGE_AUDIENCES[audience]) throw new InvalidChallengeError();

    const user = await this.admit(audience, challenge.userId);
    const enrolment = await this.enrolments.findByUserId(user.id);
    if (!enrolment || enrolment.version !== challenge.version) throw new InvalidChallengeError();

    if (enrolment.confirmedAt !== null) return this.checkCode(user, enrolment, code);
    if (audience !== 'system') throw new InvalidChallengeError();
    return this.confirmAtSignIn(user, enrolment, code);
  }

  /** The account as it is now: disabled, unverified or moved off this portal since the password step ends it. */
  private async admit(audience: LoginAudience, userId: string): Promise<AuthUser> {
    const stored = await this.users.findById(userId);
    if (!stored || stored.accountStatus === 'disabled' || stored.emailVerificationToken) throw new InvalidChallengeError();
    const user = AuthUser.create({ id: stored.id, email: stored.email, role: stored.role, tenantId: stored.tenantId });
    if (!this.login.admits(user, audience)) throw new InvalidChallengeError();
    return user;
  }

  private async checkCode(user: AuthUser, enrolment: StoredTwoFactorEnrolment, code: string): Promise<VerifiedLogin> {
    const accepted = await checkCodeAttempt(this.enrolments, user.id, () => this.acceptCode(enrolment, code));
    if (!accepted) throw new LoginCodeRefusedError(user);
    return this.spend(user, enrolment, accepted.changes, accepted.secondFactor);
  }

  private acceptCode(enrolment: StoredTwoFactorEnrolment, code: string): AcceptedCode | null {
    const step = matchTotpStep(this.cipher.decrypt(enrolment.secretCiphertext), code);
    if (step !== null && step > (enrolment.lastUsedStep ?? -1)) {
      return { changes: { lastUsedStep: step }, secondFactor: 'authenticator' };
    }
    const remaining = consumeRecoveryCode(code, enrolment.recoveryCodeHashes);
    return remaining ? { changes: { recoveryCodeHashes: remaining }, secondFactor: 'recovery_code' } : null;
  }

  private async confirmAtSignIn(user: AuthUser, enrolment: StoredTwoFactorEnrolment, code: string): Promise<VerifiedLogin> {
    const secret = this.cipher.decrypt(enrolment.secretCiphertext);
    const step = await checkCodeAttempt(this.enrolments, user.id, () => matchTotpStep(secret, code));
    if (step === null) throw new LoginCodeRefusedError(user);
    const recoveryCodes = Array.from({ length: RECOVERY_CODE_COUNT }, mintRecoveryCode);
    const changes = { confirmedAt: new Date(), recoveryCodeHashes: recoveryCodes.map(hashRecoveryCode), lastUsedStep: step };
    return { ...(await this.spend(user, enrolment, changes, 'enrolment')), recoveryCodes };
  }

  /** Moves the version on, atomically: of two uses of one challenge, only the first gets through. */
  private async spend(
    user: AuthUser,
    enrolment: StoredTwoFactorEnrolment,
    changes: Partial<StoredTwoFactorEnrolment>,
    secondFactor: SecondFactor,
  ): Promise<VerifiedLogin> {
    const next = { ...enrolment, ...changes, version: enrolment.version + 1, updatedAt: new Date() };
    if (!(await this.enrolments.saveIfVersion(next, enrolment.version))) throw new InvalidChallengeError();
    return { user, secondFactor };
  }

  private async enrolAtSignIn(user: AuthUser, existing: StoredTwoFactorEnrolment | null): Promise<LoginStart> {
    const secret = generateTotpSecret();
    const now = new Date();
    const enrolment: StoredTwoFactorEnrolment = {
      userId: user.id,
      secretCiphertext: this.cipher.encrypt(secret).ciphertext,
      confirmedAt: null,
      recoveryCodeHashes: [],
      lastUsedStep: null,
      version: (existing?.version ?? 0) + 1,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    await this.enrolments.save(enrolment);
    return {
      kind: 'enrolment',
      challengeToken: this.challengeFor('system', enrolment),
      secret,
      otpauthUri: totpEnrolmentUri({ secret, accountName: user.email, issuer: TOTP_ISSUER }),
    };
  }

  private challengeFor(audience: LoginAudience, enrolment: StoredTwoFactorEnrolment): string {
    return issueChallengeToken(
      { userId: enrolment.userId, audience: CHALLENGE_AUDIENCES[audience], version: enrolment.version },
      this.config.auth.jwtSecret,
    );
  }
}

export type PendingLogin = Exclude<LoginStart, { kind: 'session' }>;

/** What a login answers while a code is still owed. */
export function challengeBody(started: PendingLogin) {
  if (started.kind === 'code') return { twoFactorRequired: true, step: 'code', challengeToken: started.challengeToken };
  return {
    twoFactorRequired: true,
    step: 'enrolment',
    challengeToken: started.challengeToken,
    enrolment: { secret: started.secret, otpauthUri: started.otpauthUri },
  };
}
