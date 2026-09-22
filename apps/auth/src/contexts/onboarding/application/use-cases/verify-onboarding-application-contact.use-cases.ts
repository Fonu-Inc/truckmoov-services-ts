import { Inject, Injectable } from '@nestjs/common';
import { ID_GENERATOR, type IdGenerator } from '@auth/session/domain/ports/id-generator.port';
import {
  ONBOARDING_APPLICATION_REPOSITORY,
  type OnboardingApplicationRepository,
  type OnboardingVerificationChannel,
  type StoredOnboardingApplication,
} from '@auth/onboarding/domain/onboarding-application.repository';
import {
  assertApplicationEditable,
  generateVerificationCode,
  hashApplicationToken,
  verificationCodeMatches,
  VERIFICATION_CODE_TTL_MS,
  VERIFICATION_MAX_ATTEMPTS,
  VERIFICATION_MAX_SENDS_PER_HOUR,
  VERIFICATION_RESEND_COOLDOWN_MS,
} from '@auth/onboarding/domain/onboarding-application.support';
import { loadApplicationView } from './support/load-application-view';
import { validateVerificationCode } from '@auth/onboarding/domain/onboarding-application.validation';
import { GetOnboardingApplicationUseCase } from './get-onboarding-application.use-case';
import {
  ONBOARDING_VERIFICATION_NOTIFIER,
  type OnboardingVerificationNotifier,
} from '@auth/onboarding/domain/ports/onboarding-verification-notifier.port';

export class VerificationResendTooSoonError extends Error {
  constructor(secondsRemaining: number) {
    super(`Wait ${secondsRemaining} seconds before requesting another code`);
    this.name = 'VerificationResendTooSoonError';
  }
}

export class VerificationSendLimitError extends Error {
  constructor() {
    super('Too many codes requested for this application, try again later');
    this.name = 'VerificationSendLimitError';
  }
}

export class InvalidVerificationCodeError extends Error {
  constructor(message = 'The verification code is incorrect or has expired') {
    super(message);
    this.name = 'InvalidVerificationCodeError';
  }
}

@Injectable()
export class SendOnboardingVerificationCodeUseCase {
  constructor(
    @Inject(ONBOARDING_APPLICATION_REPOSITORY)
    private readonly applications: OnboardingApplicationRepository,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
    @Inject(ONBOARDING_VERIFICATION_NOTIFIER)
    private readonly notifier: OnboardingVerificationNotifier,
    @Inject(GetOnboardingApplicationUseCase)
    private readonly getApplication: GetOnboardingApplicationUseCase,
  ) {}

  async execute(input: {
    applicationId: string;
    applicationToken: string;
    channel: OnboardingVerificationChannel;
  }) {
    const application = await this.getApplication.resolve(
      input.applicationId,
      input.applicationToken,
    );
    assertApplicationEditable(application);
    await this.assertSendAllowed(application.id, input.channel);

    const destination = destinationFor(application, input.channel);
    const code = generateVerificationCode();
    const now = new Date();

    // Any earlier code stops working the moment a new one is sent, so two live
    // codes can never be valid at once.
    await this.applications.invalidateVerificationCodes(
      application.id,
      input.channel,
    );
    await this.applications.saveVerificationCode({
      id: this.idGenerator.generate(),
      applicationId: application.id,
      channel: input.channel,
      codeHash: hashApplicationToken(code),
      destination,
      attempts: 0,
      consumedAt: null,
      expiresAt: new Date(now.getTime() + VERIFICATION_CODE_TTL_MS),
      createdAt: now,
    });

    if (input.channel === 'email') {
      await this.notifier.sendEmailCode({
        destination,
        code,
        organizationName: application.organizationName,
      });
    } else {
      await this.notifier.sendSmsCode({
        destination,
        code,
        organizationName: application.organizationName,
      });
    }

    return {
      status: true,
      message: `Verification code sent`,
      data: {
        channel: input.channel,
        destination: maskDestination(destination, input.channel),
        expiresInSeconds: VERIFICATION_CODE_TTL_MS / 1000,
      },
    };
  }

  private async assertSendAllowed(
    applicationId: string,
    channel: OnboardingVerificationChannel,
  ): Promise<void> {
    const sentWithinTheHour =
      await this.applications.countRecentVerificationCodes(
        applicationId,
        channel,
        new Date(Date.now() - 60 * 60 * 1000),
      );
    if (sentWithinTheHour >= VERIFICATION_MAX_SENDS_PER_HOUR) {
      throw new VerificationSendLimitError();
    }

    const latest = await this.applications.findActiveVerificationCode(
      applicationId,
      channel,
    );
    if (!latest) return;
    const elapsed = Date.now() - latest.createdAt.getTime();
    if (elapsed < VERIFICATION_RESEND_COOLDOWN_MS) {
      throw new VerificationResendTooSoonError(
        Math.ceil((VERIFICATION_RESEND_COOLDOWN_MS - elapsed) / 1000),
      );
    }
  }
}

@Injectable()
export class ConfirmOnboardingVerificationCodeUseCase {
  constructor(
    @Inject(ONBOARDING_APPLICATION_REPOSITORY)
    private readonly applications: OnboardingApplicationRepository,
    @Inject(GetOnboardingApplicationUseCase)
    private readonly getApplication: GetOnboardingApplicationUseCase,
  ) {}

  async execute(input: {
    applicationId: string;
    applicationToken: string;
    channel: OnboardingVerificationChannel;
    code: unknown;
  }) {
    const application = await this.getApplication.resolve(
      input.applicationId,
      input.applicationToken,
    );
    assertApplicationEditable(application);

    const code = validateVerificationCode(input.code);
    const stored = await this.applications.findActiveVerificationCode(
      application.id,
      input.channel,
    );
    if (!stored || stored.expiresAt.getTime() <= Date.now()) {
      throw new InvalidVerificationCodeError();
    }
    // The code was proven against the address it was sent to. If the applicant
    // changed it since, this code is no longer evidence of anything.
    if (stored.destination !== destinationFor(application, input.channel)) {
      throw new InvalidVerificationCodeError();
    }
    if (stored.attempts >= VERIFICATION_MAX_ATTEMPTS) {
      await this.applications.saveVerificationCode({
        ...stored,
        consumedAt: new Date(),
      });
      throw new InvalidVerificationCodeError(
        'Too many incorrect attempts, request a new code',
      );
    }

    if (!verificationCodeMatches(code, stored.codeHash)) {
      await this.applications.saveVerificationCode({
        ...stored,
        attempts: stored.attempts + 1,
      });
      throw new InvalidVerificationCodeError();
    }

    const now = new Date();
    await this.applications.saveVerificationCode({
      ...stored,
      attempts: stored.attempts + 1,
      consumedAt: now,
    });

    const updated: StoredOnboardingApplication = {
      ...application,
      emailVerifiedAt:
        input.channel === 'email' ? now : application.emailVerifiedAt,
      phoneVerifiedAt:
        input.channel === 'sms' ? now : application.phoneVerifiedAt,
      updatedAt: now,
    };
    await this.applications.save(updated);

    const documents = await this.applications.findDocumentsByApplicationId(
      application.id,
    );

    return {
      status: true,
      message: input.channel === 'email' ? 'Email verified' : 'Phone number verified',
      data: await loadApplicationView(this.applications, updated),
    };
  }
}

function destinationFor(
  application: StoredOnboardingApplication,
  channel: OnboardingVerificationChannel,
): string {
  return channel === 'email'
    ? application.businessEmail
    : application.organizationPhone;
}

function maskDestination(
  destination: string,
  channel: OnboardingVerificationChannel,
): string {
  if (channel === 'sms') {
    return `${destination.slice(0, 7)}****${destination.slice(-2)}`;
  }
  const [local, domain] = destination.split('@');
  const head = local.slice(0, 2);
  return `${head}${'*'.repeat(Math.max(local.length - 2, 1))}@${domain}`;
}
