import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { of, lastValueFrom } from 'rxjs';
import { describe, expect, it } from 'vitest';
import {
  StandardApiResponse,
  TransformResponseInterceptor,
} from '../../../libs/shared/openapi/src';

describe('TransformResponseInterceptor', () => {
  const interceptor = new TransformResponseInterceptor();
  const context = {} as ExecutionContext;

  it('wraps raw controller payloads once', async () => {
    const handler: CallHandler = {
      handle: () => of({ totalTenants: 2 }),
    };

    const result = await lastValueFrom(interceptor.intercept(context, handler));

    expect(result).toEqual({
      status: true,
      message: 'success',
      data: { totalTenants: 2 },
    });
  });

  it('passes through pre-wrapped standard responses unchanged', async () => {
    const payload = StandardApiResponse.ok(
      { totalTenants: 2 },
      'Tenant summary loaded',
    );
    const handler: CallHandler = {
      handle: () => of(payload),
    };

    const result = await lastValueFrom(interceptor.intercept(context, handler));

    expect(result).toBe(payload);
    expect(result).toEqual({
      status: true,
      message: 'Tenant summary loaded',
      data: { totalTenants: 2 },
    });
  });
});
