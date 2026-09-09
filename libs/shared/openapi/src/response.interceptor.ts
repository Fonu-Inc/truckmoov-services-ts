import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  StreamableFile,
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

/**
 * A file is the response, not something to wrap in one. Passing a
 * StreamableFile through the envelope serialises the wrapper object and the
 * caller downloads a class dump instead of the bytes.
 */
function isRawResponse(value: unknown): value is StreamableFile | Buffer {
  return value instanceof StreamableFile || Buffer.isBuffer(value);
}

@Injectable()
export class TransformResponseInterceptor implements NestInterceptor {
  intercept(
    _ctx: ExecutionContext,
    next: CallHandler,
  ): Observable<StandardApiResponse<unknown> | StreamableFile | Buffer> {
    return next
      .handle()
      .pipe(
        map((data: unknown) =>
          isStandardApiResponse(data) || isRawResponse(data)
            ? data
            : StandardApiResponse.ok(data),
        ),
      );
  }
}
