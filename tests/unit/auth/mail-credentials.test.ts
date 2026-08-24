import { describe, expect, it, beforeEach, vi } from 'vitest';
import { SecretCipherService } from '@shared/crypto';
import { InMemoryMailCredentialsRepository } from '../../../apps/auth/src/in-memory-mail-credentials.repository';
import {
  SaveMailCredentialsUseCase,
  UnsafeMailHostError,
  UnsupportedMailPortError,
} from '../../../apps/auth/src/save-mail-credentials.use-case';
import { GetMailCredentialsUseCase } from '../../../apps/auth/src/get-mail-credentials.use-case';
import { ForbiddenError } from '../../../apps/auth/src/contexts/auth/session';

const KEY = Buffer.alloc(32, 7);

function cipher() {
  return new SecretCipherService({ security: { secretEncryptionKey: KEY } } as never);
}

function actor(role = 'ENTERPRISE_ADMIN') {
  return {
    id: 'user-1',
    email: 'admin@example.com',
    role,
    tenantId: 'tenant-a',
    accountStatus: 'enabled',
    passwordHash: 'x',
    profile: {},
  };
}

function build(role = 'ENTERPRISE_ADMIN') {
  const repository = new InMemoryMailCredentialsRepository();
  const tokenService = { resolveAccessToken: () => ({ id: 'user-1' }) } as never;
  const userRepository = { findById: vi.fn(async () => actor(role)) } as never;

  return {
    repository,
    save: new SaveMailCredentialsUseCase(tokenService, userRepository, repository, cipher()),
    get: new GetMailCredentialsUseCase(tokenService, userRepository, repository),
  };
}

const command = {
  accessToken: 'token',
  emailAddress: 'ops@Tenant.com',
  displayName: '  Tenant Ops  ',
  imap: { host: 'imap.gmail.com', port: 993, username: 'ops', password: 'sup3rsecret1234' },
  smtp: { host: 'smtp.gmail.com', port: 587, username: 'ops', password: 'sup3rsecret1234' },
};

describe('saving mail credentials', () => {
  let harness: ReturnType<typeof build>;

  beforeEach(() => {
    harness = build();
  });

  it('stores the credentials and returns a masked view', async () => {
    const view = await harness.save.execute(command);

    expect(view.imap.passwordPreview).toBe('••••••••1234');
    expect(view.smtp.passwordPreview).toBe('••••••••1234');
  });

  it('never returns the password or its ciphertext', async () => {
    const view = await harness.save.execute(command);

    expect(JSON.stringify(view)).not.toContain('sup3rsecret1234');
    expect(JSON.stringify(view)).not.toContain('passwordCiphertext');
  });

  it('encrypts at rest, so the stored value is not the password', async () => {
    await harness.save.execute(command);
    const stored = await harness.repository.findByTenant('tenant-a');

    expect(stored?.imap.passwordCiphertext).not.toContain('sup3rsecret1234');
    expect(stored?.smtp.passwordCiphertext).not.toContain('sup3rsecret1234');
  });

  it('can recover the password for the server that has to use it', async () => {
    await harness.save.execute(command);
    const stored = await harness.repository.findByTenant('tenant-a');

    expect(cipher().decrypt(stored!.imap.passwordCiphertext)).toBe('sup3rsecret1234');
  });

  it('encrypts the same password to different ciphertext each time', async () => {
    await harness.save.execute(command);
    const first = (await harness.repository.findByTenant('tenant-a'))!.imap.passwordCiphertext;
    await harness.save.execute(command);
    const second = (await harness.repository.findByTenant('tenant-a'))!.imap.passwordCiphertext;

    expect(first).not.toBe(second);
  });

  it('normalises the address and trims the display name', async () => {
    const view = await harness.save.execute(command);

    expect(view.emailAddress).toBe('ops@tenant.com');
    expect(view.displayName).toBe('Tenant Ops');
  });

  it('starts unverified, because saving is not proof it works', async () => {
    const view = await harness.save.execute(command);

    expect(view.lastVerifiedAt).toBeNull();
  });
});

describe('mail host is checked before we ever connect to it', () => {
  let harness: ReturnType<typeof build>;

  beforeEach(() => {
    harness = build();
  });

  it('refuses an internal cluster service', async () => {
    await expect(
      harness.save.execute({ ...command, imap: { ...command.imap, host: 'postgres' } }),
    ).rejects.toBeInstanceOf(UnsafeMailHostError);
  });

  it('refuses the cloud metadata endpoint', async () => {
    await expect(
      harness.save.execute({ ...command, imap: { ...command.imap, host: '169.254.169.254' } }),
    ).rejects.toBeInstanceOf(UnsafeMailHostError);
  });

  it('refuses loopback', async () => {
    await expect(
      harness.save.execute({ ...command, smtp: { ...command.smtp, host: '127.0.0.1' } }),
    ).rejects.toBeInstanceOf(UnsafeMailHostError);
  });

  it('checks the smtp host too, not just imap', async () => {
    await expect(
      harness.save.execute({ ...command, smtp: { ...command.smtp, host: '10.0.0.1' } }),
    ).rejects.toBeInstanceOf(UnsafeMailHostError);
  });

  it('refuses a port that is not a mail port', async () => {
    await expect(
      harness.save.execute({ ...command, imap: { ...command.imap, port: 5432 } }),
    ).rejects.toBeInstanceOf(UnsupportedMailPortError);
  });

  it('writes nothing when the host is refused', async () => {
    await expect(
      harness.save.execute({ ...command, imap: { ...command.imap, host: 'localhost' } }),
    ).rejects.toThrow();

    await expect(harness.repository.findByTenant('tenant-a')).resolves.toBeNull();
  });
});

describe('who may configure the mailbox', () => {
  it('refuses a role that does not administer the organisation', async () => {
    await expect(build('DISPATCHER').save.execute(command)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('allows a fleet admin', async () => {
    await expect(build('FLEET_ADMIN').save.execute(command)).resolves.toBeTruthy();
  });
});

describe('reading mail credentials', () => {
  it('returns null when no mailbox is connected', async () => {
    await expect(build().get.execute('token')).resolves.toBeNull();
  });

  it('returns the masked view, never the secret', async () => {
    const harness = build();
    await harness.save.execute(command);

    const view = await harness.get.execute('token');

    expect(view?.imap.passwordPreview).toBe('••••••••1234');
    expect(JSON.stringify(view)).not.toContain('sup3rsecret1234');
  });
});
