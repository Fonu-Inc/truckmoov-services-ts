import { describe, expect, it } from 'vitest';
import { GetMeUseCase } from '../../../apps/auth/src/contexts/auth/session/application/use-cases/get-me.use-case';
import { InvalidAccessTokenError } from '../../../apps/auth/src/contexts/auth/session/domain/errors/invalid-access-token.error';

function useCase() {
  const tokenService = { resolveAccessToken: () => null } as never;
  const userRepo = { findById: () => Promise.resolve(null) } as never;
  return new GetMeUseCase(tokenService, userRepo);
}

describe('GetMeUseCase', () => {
  it.each([undefined, '', 'Basic abc', 'Bearer'])(
    'rejects a request without a bearer token: %s',
    async (header) => {
      await expect(useCase().execute(header)).rejects.toBeInstanceOf(InvalidAccessTokenError);
    },
  );

  it('rejects a bearer token that does not resolve', async () => {
    await expect(useCase().execute('Bearer nope')).rejects.toBeInstanceOf(InvalidAccessTokenError);
  });
});
