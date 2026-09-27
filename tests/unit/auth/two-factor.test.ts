import { createHmac } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateTotpSecret, matchTotpStep, TOTP_PERIOD_SECONDS, totpCodeAt } from '@shared/crypto';
import {
  BeginTwoFactorEnrolmentUseCase,
  ConfirmTwoFactorEnrolmentUseCase,
  consumeRecoveryCode,
  DisableTwoFactorUseCase,
  GetTwoFactorStatusUseCase,
  hashRecoveryCode,
  InvalidTwoFactorCodeError,
  TwoFactorAlreadyEnrolledError,
  TwoFactorNotEnrolledError,
  TwoFactorRequiredError,
} from '../../../apps/auth/src/two-factor.use-cases';
import { InMemoryTwoFactorRepository } from '../../../apps/auth/src/mikro-two-factor.repository';
import { TwoFactorCooldownError } from '../../../apps/auth/src/two-factor-attempts';
import { Migration20260927120000 } from '../../../apps/auth/src/migrations/Migration20260927120000';
import {
  issueChallengeToken,
  loginChallengeKind,
  readChallengeToken,
  twoFactorRequiredForLogin,
} from '../../../apps/auth/src/two-factor-login';

const TOKEN = 'access-token';
const SIGNING_SECRET = 'challenge-secret';

function actor() {
  return { resolveAccessToken: () => ({ id: 'user-1' }) as never };
}

function users() {
  return {
    findById: async () => ({
      id: 'user-1',
      email: 'admin@fleetpro.com',
      passwordHash: 'x',
      role: 'SYSTEM_ADMIN',
      tenantId: 'system',
      accountStatus: 'enabled',
    }),
  };
}

/** Round trips without a key, so the tests are about the flow. */
function cipher() {
  return {
    encrypt: (plaintext: string) => ({ ciphertext: plaintext, preview: '' }),
    decrypt: (ciphertext: string) => ciphertext,
  };
}

function settings(requireTwoFactor = false) {
  return { get: async () => ({ security: { requireTwoFactor } }) };
}

function build(requireTwoFactor = false) {
  const repository = new InMemoryTwoFactorRepository();
  return {
    repository,
    begin: new BeginTwoFactorEnrolmentUseCase(
      actor() as never,
      users() as never,
      repository,
      cipher() as never,
    ),
    confirm: new ConfirmTwoFactorEnrolmentUseCase(
      actor() as never,
      users() as never,
      repository,
      cipher() as never,
    ),
    disable: new DisableTwoFactorUseCase(
      actor() as never,
      users() as never,
      repository,
      cipher() as never,
      settings(requireTwoFactor) as never,
    ),
    status: new GetTwoFactorStatusUseCase(
      actor() as never,
      users() as never,
      repository,
      settings(requireTwoFactor) as never,
    ),
  };
}

async function enrol(kit: ReturnType<typeof build>) {
  const started = await kit.begin.execute(TOKEN);
  const secret = started.data.secret;
  const confirmed = await kit.confirm.execute(TOKEN, totpCodeAt(secret, Date.now()));
  return { secret, recoveryCodes: confirmed.data.recoveryCodes };
}

describe('Two-factor enrolment', () => {
  it('hands the secret over once, as a scannable URI', async () => {
    const kit = build();
    const started = await kit.begin.execute(TOKEN);

    expect(started.data.secret).toMatch(/^[A-Z2-7]+$/);
    expect(started.data.otpauthUri).toContain('otpauth://totp/');
    expect(started.data.otpauthUri).toContain('admin%40fleetpro.com');
  });

  // Enrolling and then closing the tab must not lock the account.
  it('does not count as enrolled until a code is confirmed', async () => {
    const kit = build();
    await kit.begin.execute(TOKEN);

    const status = await kit.status.execute(TOKEN);
    expect(status.data.enrolled).toBe(false);
    expect(status.data.pendingConfirmation).toBe(true);
  });

  it('turns on once a correct code proves the app works', async () => {
    const kit = build();
    await enrol(kit);

    const status = await kit.status.execute(TOKEN);
    expect(status.data.enrolled).toBe(true);
    expect(status.data.pendingConfirmation).toBe(false);
    expect(status.data.recoveryCodesRemaining).toBe(8);
  });

  it('refuses to confirm on a wrong code', async () => {
    const kit = build();
    await kit.begin.execute(TOKEN);

    await expect(kit.confirm.execute(TOKEN, '000000')).rejects.toBeInstanceOf(
      InvalidTwoFactorCodeError,
    );
  });

  it('refuses to confirm what was never begun', async () => {
    const kit = build();
    await expect(kit.confirm.execute(TOKEN, '123456')).rejects.toBeInstanceOf(
      TwoFactorNotEnrolledError,
    );
  });

  it('refuses to enrol twice', async () => {
    const kit = build();
    await enrol(kit);

    await expect(kit.begin.execute(TOKEN)).rejects.toBeInstanceOf(TwoFactorAlreadyEnrolledError);
  });

  // Restarting an unconfirmed enrolment is how somebody recovers from scanning
  // the code onto a phone they then wiped.
  it('lets an unconfirmed enrolment be restarted with a fresh secret', async () => {
    const kit = build();
    const first = await kit.begin.execute(TOKEN);
    const second = await kit.begin.execute(TOKEN);

    expect(second.data.secret).not.toBe(first.data.secret);
  });

  it('issues recovery codes exactly once, and keeps only hashes', async () => {
    const kit = build();
    const { recoveryCodes } = await enrol(kit);
    const stored = await kit.repository.findByUserId('user-1');

    expect(recoveryCodes).toHaveLength(8);
    for (const code of recoveryCodes) {
      expect(stored?.recoveryCodeHashes).not.toContain(code);
      expect(stored?.recoveryCodeHashes).toContain(hashRecoveryCode(code));
    }
  });
});

describe('Turning two-factor off', () => {
  it('needs a current code', async () => {
    const kit = build();
    await enrol(kit);

    await expect(kit.disable.execute(TOKEN, '000000')).rejects.toBeInstanceOf(
      InvalidTwoFactorCodeError,
    );
  });

  it('removes the enrolment when the code is right', async () => {
    const kit = build();
    const { secret } = await enrol(kit);

    await kit.disable.execute(TOKEN, totpCodeAt(secret, Date.now()));
    expect(await kit.repository.findByUserId('user-1')).toBeNull();
  });

  // Otherwise a person could opt out of a control the platform imposes.
  it('refuses while the platform requires it', async () => {
    const kit = build(true);
    const { secret } = await enrol(kit);

    await expect(
      kit.disable.execute(TOKEN, totpCodeAt(secret, Date.now())),
    ).rejects.toBeInstanceOf(TwoFactorRequiredError);
  });
});

describe('Recovery codes', () => {
  it('consumes a code once and leaves the rest', () => {
    const codes = ['aaaaa-bbbbb', 'ccccc-ddddd'];
    const hashes = codes.map(hashRecoveryCode);

    const remaining = consumeRecoveryCode('aaaaa-bbbbb', hashes);
    expect(remaining).toHaveLength(1);
    expect(remaining).toContain(hashRecoveryCode('ccccc-ddddd'));
  });

  // A written-down list must not be replayable.
  it('will not accept the same code twice', () => {
    const hashes = ['aaaaa-bbbbb'].map(hashRecoveryCode);
    const remaining = consumeRecoveryCode('aaaaa-bbbbb', hashes)!;

    expect(consumeRecoveryCode('aaaaa-bbbbb', remaining)).toBeNull();
  });

  it('ignores case and surrounding space, as typed off paper', () => {
    const hashes = ['aaaaa-bbbbb'].map(hashRecoveryCode);
    expect(consumeRecoveryCode('  AAAAA-BBBBB ', hashes)).toEqual([]);
  });

  it('returns null for a code that was never issued', () => {
    expect(consumeRecoveryCode('zzzzz-zzzzz', [hashRecoveryCode('aaaaa-bbbbb')])).toBeNull();
  });
});

describe('The login challenge', () => {
  it('round trips a signed challenge', () => {
    const token = issueChallengeToken({ userId: 'user-1', audience: 'system', version: 1 }, SIGNING_SECRET);
    expect(readChallengeToken(token, SIGNING_SECRET)).toMatchObject({
      userId: 'user-1',
      audience: 'system',
    });
  });

  it('refuses one signed with a different secret', () => {
    const token = issueChallengeToken({ userId: 'user-1', audience: 'system', version: 1 }, SIGNING_SECRET);
    expect(readChallengeToken(token, 'another-secret')).toBeNull();
  });

  it('refuses a tampered payload', () => {
    const token = issueChallengeToken({ userId: 'user-1', audience: 'system', version: 1 }, SIGNING_SECRET);
    const forged = `${Buffer.from(
      JSON.stringify({ userId: 'someone-else', audience: 'system', expiresAt: 99999999999 }),
    ).toString('base64url')}.${token.split('.')[1]}`;

    expect(readChallengeToken(forged, SIGNING_SECRET)).toBeNull();
  });

  it('expires', () => {
    const token = issueChallengeToken({ userId: 'user-1', audience: 'system', version: 1 }, SIGNING_SECRET, 0);
    expect(readChallengeToken(token, SIGNING_SECRET, 10 * 60 * 1000)).toBeNull();
  });

  // Legacy access tokens are payload.hmac under the same secret.
  it('refuses a payload signed the way an access token is', () => {
    const encoded = Buffer.from(
      JSON.stringify({ userId: 'user-1', audience: 'system', version: 1, expiresAt: 99999999999 }),
    ).toString('base64url');
    const signature = createHmac('sha256', SIGNING_SECRET).update(encoded).digest('base64url');

    expect(readChallengeToken(`${encoded}.${signature}`, SIGNING_SECRET)).toBeNull();
  });

  it('refuses a malformed token', () => {
    for (const token of ['', 'nodot', 'a.b.c']) {
      expect(readChallengeToken(token, SIGNING_SECRET)).toBeNull();
    }
  });
});

describe('Deciding whether a login needs a code', () => {
  it('asks for a code from someone who has enrolled', () => {
    expect(twoFactorRequiredForLogin({ platformRequires: false, enrolmentConfirmed: true })).toBe(true);
    expect(loginChallengeKind({ platformRequires: false, enrolmentConfirmed: true })).toBe('code');
  });

  // Refusing outright would lock every administrator out the moment the
  // setting was switched on, so they are sent to enrol instead.
  it('sends an un-enrolled person to enrol when the platform requires it', () => {
    expect(loginChallengeKind({ platformRequires: true, enrolmentConfirmed: false })).toBe(
      'enrolment_required',
    );
  });

  it('lets everybody else straight through', () => {
    expect(twoFactorRequiredForLogin({ platformRequires: false, enrolmentConfirmed: false })).toBe(false);
    expect(loginChallengeKind({ platformRequires: false, enrolmentConfirmed: false })).toBe('none');
  });
});

describe('Matching a code to its time step', () => {
  it('names the step the code belongs to, within one step either side', () => {
    const secret = generateTotpSecret();
    const now = 1_700_000_000_000;
    const step = Math.floor(now / 1000 / TOTP_PERIOD_SECONDS);

    expect(matchTotpStep(secret, totpCodeAt(secret, now), now)).toBe(step);
    expect(matchTotpStep(secret, totpCodeAt(secret, now - TOTP_PERIOD_SECONDS * 1000), now)).toBe(step - 1);
    expect(matchTotpStep(secret, totpCodeAt(secret, now - 3 * TOTP_PERIOD_SECONDS * 1000), now)).toBeNull();
  });
});

describe('The wrong-code cooldown on enrolment and turning off', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-27T10:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  async function refuseThrice(attempt: (code: string) => Promise<unknown>) {
    for (let i = 0; i < 3; i += 1) {
      await expect(attempt('000000')).rejects.toBeInstanceOf(InvalidTwoFactorCodeError);
    }
  }

  it('refuses the confirming code for 60 seconds after three wrong ones', async () => {
    const kit = build();
    const { data } = await kit.begin.execute(TOKEN);
    await refuseThrice((code) => kit.confirm.execute(TOKEN, code));

    await expect(kit.confirm.execute(TOKEN, totpCodeAt(data.secret, Date.now()))).rejects.toBeInstanceOf(TwoFactorCooldownError);
    vi.advanceTimersByTime(60_000);

    await expect(kit.confirm.execute(TOKEN, totpCodeAt(data.secret, Date.now()))).resolves.toBeTruthy();
  });

  it('keeps the cooldown when the enrolment is restarted', async () => {
    const kit = build();
    await kit.begin.execute(TOKEN);
    await refuseThrice((code) => kit.confirm.execute(TOKEN, code));
    const { data } = await kit.begin.execute(TOKEN);

    await expect(kit.confirm.execute(TOKEN, totpCodeAt(data.secret, Date.now()))).rejects.toBeInstanceOf(TwoFactorCooldownError);
  });

  it('refuses the code that turns it off for 60 seconds after three wrong ones', async () => {
    const kit = build();
    const { secret } = await enrol(kit);
    await refuseThrice((code) => kit.disable.execute(TOKEN, code));

    await expect(kit.disable.execute(TOKEN, totpCodeAt(secret, Date.now()))).rejects.toMatchObject({
      message: 'Too many wrong codes, try again in 60 seconds',
      retryAfterSeconds: 60,
    });
    expect(await kit.repository.findByUserId('user-1')).not.toBeNull();

    vi.advanceTimersByTime(60_000);
    await kit.disable.execute(TOKEN, totpCodeAt(secret, Date.now()));
    expect(await kit.repository.findByUserId('user-1')).toBeNull();
  });

  it('adds the count and the block to the enrolment table, nothing else', () => {
    const statements: string[] = [];
    const migration = Object.create(Migration20260927120000.prototype) as Migration20260927120000;
    Object.assign(migration, { addSql: (statement: string) => statements.push(statement) });
    void migration.up();

    expect(statements).toEqual([
      'alter table "auth_two_factor_enrolments" add column if not exists "failed_code_count" integer not null default 0;',
      'alter table "auth_two_factor_enrolments" add column if not exists "codes_blocked_until" timestamptz null;',
    ]);
  });
});

