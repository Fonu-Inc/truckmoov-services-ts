import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ForbiddenError } from './contexts/auth/session';
import { InvalidAccessTokenError } from './contexts/auth/session/domain/errors/invalid-access-token.error';
import { OnboardingValidationError } from './contexts/onboarding/domain/onboarding-application.validation';
import { InvalidStageTransitionError } from './contexts/onboarding/domain/onboarding-stage';
import {
  FleetDeviceRefusedError,
  FleetUnavailableError,
  InstallationJobClosedError,
  InstallationJobConflictError,
  InstallationJobNotFoundError,
} from './contexts/installation/domain/installation-job.errors';
import { InvalidInstallerPhotoError } from './contexts/installation/domain/installer-photo';
import { InvalidEvidenceError } from './contexts/installation/domain/installation-evidence';
import { InstallerNotificationNotFoundError } from './contexts/installation/domain/installer-notification';
import {
  INSTALLATION_ORDER_STATUSES,
  InvalidInstallationDateError,
  InvalidInstallationTransitionError,
  type InstallationOrderStatus,
} from './contexts/installation/domain/installation-order';

export function jobStatusFilter(value?: string): InstallationOrderStatus | undefined {
  if (!value) return undefined;
  if (!(INSTALLATION_ORDER_STATUSES as readonly string[]).includes(value)) {
    throw new BadRequestException(`status must be one of: ${INSTALLATION_ORDER_STATUSES.join(', ')}`);
  }
  return value as InstallationOrderStatus;
}

export function numeric(value?: string): number | undefined {
  const parsed = Number(value);
  return value && Number.isFinite(parsed) ? parsed : undefined;
}

export function bearer(authorization?: string): string {
  const [scheme, token] = (authorization ?? '').split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) throw new UnauthorizedException('Missing authorization');
  return token;
}

const REFUSALS: Array<[new (...args: never[]) => Error, new (message?: string) => HttpException]> = [
  [OnboardingValidationError, BadRequestException],
  [InvalidInstallerPhotoError, BadRequestException],
  [InvalidEvidenceError, BadRequestException],
  [InvalidInstallationDateError, BadRequestException],
  [FleetDeviceRefusedError, UnprocessableEntityException],
  [InstallationJobNotFoundError, NotFoundException],
  [InstallerNotificationNotFoundError, NotFoundException],
  [InstallationJobClosedError, ConflictException],
  [InstallationJobConflictError, ConflictException],
  [InvalidInstallationTransitionError, ConflictException],
  [InvalidStageTransitionError, ConflictException],
  [FleetUnavailableError, ServiceUnavailableException],
  [ForbiddenError, ForbiddenException],
  [InvalidAccessTokenError, UnauthorizedException],
];

/** Installation domain errors as HTTP answers. */
export async function mapped<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    const refusal = REFUSALS.find(([type]) => error instanceof type);
    if (refusal) throw new refusal[1]((error as Error).message);
    throw error;
  }
}

export const ok = (data: unknown, message = 'success') => ({ status: true, message, data });
