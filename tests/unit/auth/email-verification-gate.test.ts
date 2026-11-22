import { describe, expect, it, vi } from 'vitest';
import { DbIdentityProvider } from '../../../apps/auth/src/contexts/auth/session/infrastructure/db-identity.provider';
import { RefreshUseCase } from '../../../apps/auth/src/contexts/auth/session/application/use-cases/refresh.use-case';
import { ResendVerificationUseCase } from '../../../apps/auth/src/contexts/auth/session/application/use-cases/resend-verification.use-case';
import { EmailNotVerifiedError } from '../../../apps/auth/src/contexts/auth/session/domain/errors/email-not-verified.error';
import { InvalidCredentialsError } from '../../../apps/auth/src/contexts/auth/session/domain/errors/invalid-credentials.error';

/** These tests are about refresh, not about the idle timeout. */
function noSessionTimeout() {
  return { idleTimeoutMinutes: async () => null };
}


function storedUser(overrides: Record<string, unknown> = {}) {
  return {
    id: 'user-1',
    email: 'new@example.com',
    passwordHash: 'hashed',
    role: 'ENTERPRISE_ADMIN',
    tenantId: 'tenant-a',
    accountStatus: 'enabled',
    emailVerificationToken: 'pending-token',
    profile: { fullName: 'New User', phoneNumber: null, address: null, profilePictureUrl: null },
    ...overrides,
  };
}

function identityProvider(user: unknown) {
  return new DbIdentityProvider(
    { findByEmail: vi.fn(async () => user) } as never,
    { verify: vi.fn(async () => true) } as never,
  );
}

describe('login refuses an unverified address', () => {
  it('rejects a user that still holds a verification token', async () => {
    await expect(
      identityProvider(storedUser()).verifyCredentials('new@example.com', 'Str0ngPass!'),
    ).rejects.toBeInstanceOf(EmailNotVerifiedError);
  });

  it('admits the same user once the token is cleared', async () => {
    const user = await identityProvider(
      storedUser({ emailVerificationToken: null }),
    ).verifyCredentials('new@example.com', 'Str0ngPass!');

    expect(user.toPrimitives().id).toBe('user-1');
  });

  it('reports a wrong password before it reports a disabled account', async () => {
    const provider = new DbIdentityProvider(
      { findByEmail: vi.fn(async () => storedUser({ accountStatus: 'disabled' })) } as never,
      { verify: vi.fn(async () => false) } as never,
    );

    await expect(provider.verifyCredentials('new@example.com', 'wrong')).rejects.toBeInstanceOf(InvalidCredentialsError);
  });

  it('reports a wrong password before it reports the unverified address', async () => {
    const provider = new DbIdentityProvider(
      { findByEmail: vi.fn(async () => storedUser()) } as never,
      { verify: vi.fn(async () => false) } as never,
    );

    await expect(
      provider.verifyCredentials('new@example.com', 'wrong'),
    ).rejects.toBeInstanceOf(InvalidCredentialsError);
  });
});

describe('refresh refuses an unverified address', () => {
  function build(user: unknown) {
    const deleteByRefreshToken = vi.fn(async () => {});
    const useCase = new RefreshUseCase(
      {
        getByRefreshToken: vi.fn(async () => ({ id: 'user-1', toPrimitives: () => ({}) })),
        deleteByRefreshToken,
        save: vi.fn(async () => {}),
        rotate: vi.fn(async () => true),
        findSpent: vi.fn(async () => null),
        branch: vi.fn(async () => false),
        revokeFamily: vi.fn(async () => {}),
      } as never,
      {
        issueAccessToken: () => 'access',
        issueRefreshToken: () => 'refresh',
      } as never,
      { findById: vi.fn(async () => user) } as never,
          noSessionTimeout(),
    );
    return { useCase, deleteByRefreshToken };
  }

  it('rejects the session registration handed out before verification', async () => {
    const { useCase } = build(storedUser());

    await expect(useCase.execute('old-refresh')).rejects.toBeInstanceOf(EmailNotVerifiedError);
  });

  it('drops the refresh token it refused, so it cannot be replayed', async () => {
    const { useCase, deleteByRefreshToken } = build(storedUser());

    await expect(useCase.execute('old-refresh')).rejects.toThrow();
    expect(deleteByRefreshToken).toHaveBeenCalledWith('old-refresh');
  });

  it('renews a verified session', async () => {
    const { useCase } = build(storedUser({ emailVerificationToken: null }));

    await expect(useCase.execute('old-refresh')).resolves.toMatchObject({
      accessToken: 'access',
      refreshToken: 'refresh',
    });
  });
});

describe('resend verification', () => {
  function build(user: unknown) {
    const save = vi.fn(async () => {});
    const sendVerificationEmail = vi.fn(async () => {});
    const useCase = new ResendVerificationUseCase(
      { findByEmail: vi.fn(async () => user), save } as never,
      { sendVerificationEmail } as never,
      { generate: () => 'fresh-token' } as never,
    );
    return { useCase, save, sendVerificationEmail };
  }

  it('issues a new token and sends it', async () => {
    const { useCase, save, sendVerificationEmail } = build(storedUser());

    await useCase.execute({ email: 'new@example.com' });

    expect(save.mock.calls[0][0].emailVerificationToken).toBe('fresh-token');
    expect(sendVerificationEmail.mock.calls[0][0].verificationToken).toBe('fresh-token');
  });

  it('replaces the previous token, so the old link stops working', async () => {
    const { useCase, save } = build(storedUser());

    await useCase.execute({ email: 'new@example.com' });

    expect(save.mock.calls[0][0].emailVerificationToken).not.toBe('pending-token');
  });

  it('sends nothing for an address that is already verified', async () => {
    const { useCase, sendVerificationEmail } = build(storedUser({ emailVerificationToken: null }));

    await useCase.execute({ email: 'new@example.com' });

    expect(sendVerificationEmail).not.toHaveBeenCalled();
  });

  it('answers the same for an unknown address, so accounts cannot be enumerated', async () => {
    const known = build(storedUser());
    const unknown = build(null);

    const knownResult = await known.useCase.execute({ email: 'new@example.com' });
    const unknownResult = await unknown.useCase.execute({ email: 'nobody@example.com' });

    expect(knownResult).toEqual(unknownResult);
  });

  it('trims the address before looking it up', async () => {
    const { useCase, sendVerificationEmail } = build(storedUser());

    await useCase.execute({ email: '  new@example.com  ' });

    expect(sendVerificationEmail).toHaveBeenCalled();
  });
});
