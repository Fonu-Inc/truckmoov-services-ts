import { describe, expect, it, beforeEach, vi } from 'vitest';
import { CompleteProfileUseCase } from '../../../apps/auth/src/contexts/auth/session/application/use-cases/complete-profile.use-case';
import { InviteUserUseCase } from '../../../apps/auth/src/contexts/auth/session/application/use-cases/invite-user.use-case';
import { InvalidVerificationTokenError } from '../../../apps/auth/src/contexts/auth/session/domain/errors/invalid-verification-token.error';
import { TokenBelongsToInviteError } from '../../../apps/auth/src/contexts/auth/session/domain/errors/token-belongs-to-invite.error';
import { EmailTakenError } from '../../../apps/auth/src/contexts/auth/session/domain/errors/email-taken.error';

const USER_TOKEN = 'b9c59be0-1005-4b0b-ac44-1f09d93e9175';
const INVITE_TOKEN = 'b44c380a-6e74-4b6e-b42f-c2a9b8deaea6';

function storedUser() {
  return {
    id: 'user-1',
    email: 'festus@example.com',
    passwordHash: 'x',
    role: 'OWNER_OPERATOR',
    tenantId: 'tenant-a',
    accountStatus: 'enabled',
    emailVerificationToken: USER_TOKEN,
    profile: { fullName: null, phoneNumber: null, address: null, profilePictureUrl: null },
  };
}

describe('CompleteProfileUseCase token discrimination', () => {
  let users: Record<string, ReturnType<typeof vi.fn>>;
  let invites: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(() => {
    users = {
      findByVerificationToken: vi.fn(async (t: string) =>
        t === USER_TOKEN ? storedUser() : null,
      ),
      save: vi.fn(async () => {}),
    };
    invites = {
      findByToken: vi.fn(async (t: string) =>
        t === INVITE_TOKEN ? { id: 'inv-1', email: 'festus@example.com', status: 'pending' } : null,
      ),
    };
  });

  function build() {
    return new CompleteProfileUseCase(
      users as never,
      { hash: async () => 'hashed' } as never,
      invites as never,
    );
  }

  const payload = { fullName: 'Festus O', password: 'Str0ngPassw0rd!' };

  it('completes the profile with the verification token', async () => {
    const result = await build().execute({ token: USER_TOKEN, ...payload });

    expect(result.userId).toBe('user-1');
    expect(users.save).toHaveBeenCalledTimes(1);
  });

  it('clears the verification token once used', async () => {
    await build().execute({ token: USER_TOKEN, ...payload });

    expect(users.save.mock.calls[0][0].emailVerificationToken).toBeNull();
  });

  it('names the invite when handed an invite token', async () => {
    await expect(build().execute({ token: INVITE_TOKEN, ...payload })).rejects.toBeInstanceOf(
      TokenBelongsToInviteError,
    );
  });

  it('does not confuse an invite token with an expired one', async () => {
    await expect(build().execute({ token: INVITE_TOKEN, ...payload })).rejects.not.toBeInstanceOf(
      InvalidVerificationTokenError,
    );
  });

  it('still reports an unknown token as invalid', async () => {
    await expect(
      build().execute({ token: 'nothing-matches-this', ...payload }),
    ).rejects.toBeInstanceOf(InvalidVerificationTokenError);
  });

  it('only consults invites once the verification lookup misses', async () => {
    await build().execute({ token: USER_TOKEN, ...payload });

    expect(invites.findByToken).not.toHaveBeenCalled();
  });

  it('writes nothing when the token is refused', async () => {
    await expect(build().execute({ token: INVITE_TOKEN, ...payload })).rejects.toThrow();

    expect(users.save).not.toHaveBeenCalled();
  });
});

describe('InviteUserUseCase duplicate-account guard', () => {
  function build(existingUser: unknown) {
    return new InviteUserUseCase(
      {
        findPendingByEmailForTenant: vi.fn(async () => null),
        save: vi.fn(async () => {}),
      } as never,
      { resolveAccessToken: () => ({ id: 'admin-1', role: 'ENTERPRISE_ADMIN', tenantId: 'tenant-a' }) } as never,
      { sendTenantInviteEmail: vi.fn(async () => {}) } as never,
      { generate: () => INVITE_TOKEN } as never,
      { findByEmail: vi.fn(async () => existingUser) } as never,
      { mayGrantRole: async () => true } as any,
    );
  }

  const command = { email: 'festus@example.com', role: 'OWNER_OPERATOR', accessToken: 'admin-token' };

  it('refuses to invite an email that already has an account', async () => {
    await expect(build(storedUser()).execute(command)).rejects.toBeInstanceOf(EmailTakenError);
  });

  it('trims the address before checking, so whitespace cannot slip past', async () => {
    await expect(
      build(storedUser()).execute({ ...command, email: '  festus@example.com  ' }),
    ).rejects.toBeInstanceOf(EmailTakenError);
  });

  it('invites an address that has no account', async () => {
    const result = await build(null).execute(command);

    expect(result).toBeTruthy();
  });
});
