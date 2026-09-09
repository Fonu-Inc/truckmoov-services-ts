import { StreamableFile } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { of } from 'rxjs';
import { firstValueFrom } from 'rxjs';
import { TransformResponseInterceptor } from '../../../libs/shared/openapi/src/response.interceptor';

function run(value: unknown) {
  const interceptor = new TransformResponseInterceptor();
  return firstValueFrom(interceptor.intercept({} as never, { handle: () => of(value) } as never));
}

describe('Response envelope', () => {
  it('wraps a plain value', async () => {
    await expect(run({ id: 1 })).resolves.toMatchObject({ status: true, data: { id: 1 } });
  });

  // Wrapping the file serialises the StreamableFile object itself, so the
  // download is a class dump rather than the bytes.
  it('leaves a StreamableFile alone', async () => {
    const file = new StreamableFile(Buffer.from('a,b\n1,2', 'utf8'));
    await expect(run(file)).resolves.toBe(file);
  });

  it('leaves a raw Buffer alone', async () => {
    const buffer = Buffer.from('a,b\n1,2', 'utf8');
    await expect(run(buffer)).resolves.toBe(buffer);
  });
});
