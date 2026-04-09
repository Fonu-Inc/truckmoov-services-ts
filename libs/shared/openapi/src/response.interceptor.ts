import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { StandardApiResponse } from './standard-response';

function isStandardApiResponse(
  value: unknown,
): value is StandardApiResponse<unknown> {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.status === 'boolean' &&
    typeof candidate.message === 'string' &&
    'data' in candidate
  );
}

@Injectable()
export class TransformResponseInterceptor implements NestInterceptor {
  intercept(
    _ctx: ExecutionContext,
    next: CallHandler,
  ): Observable<StandardApiResponse<unknown>> {
    return next
      .handle()
      .pipe(
        map((data: unknown) =>
          isStandardApiResponse(data) ? data : StandardApiResponse.ok(data),
        ),
      );
  }
}
