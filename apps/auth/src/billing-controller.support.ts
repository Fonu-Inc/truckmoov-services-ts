import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { rethrowActorError } from './base.controller';
import {
  BillingConflictError,
  BillingNotFoundError,
  BillingValidationError,
} from '@auth/onboarding/domain/billing-errors';

export function bearerToken(authorization?: string): string {
  const [scheme, token] = (authorization ?? '').split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) {
    throw new UnauthorizedException('Missing authorization');
  }
  return token;
}

export async function mapBillingErrors<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    rethrowActorError(error);
    if (error instanceof BillingValidationError) throw new BadRequestException(error.message);
    if (error instanceof BillingNotFoundError) throw new NotFoundException(error.message);
    if (error instanceof BillingConflictError) throw new ConflictException(error.message);
    throw error;
  }
}
