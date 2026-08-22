import { describe, expect, it, beforeEach, vi } from 'vitest';
import {
  TopUpAmountOutOfRangeError,
  TopupWalletUseCase,
} from '../../../apps/auth/src/topup-wallet.use-case';
import {
  buildDefaultSystemSettings,
  type SystemSettings,
} from '../../../apps/auth/src/system-settings.repository';

const TOKEN = 'tenant-token';

function tokenService() {
  return { resolveAccessToken: () => ({ id: 'user-1' }) as never };
}

function userRepo() {
  return {
    findById: async () => ({
      id: 'user-1',
      email: 'ops@carrier.ng',
      passwordHash: 'x',
      role: 'FLEET_ADMIN',
      tenantId: 'tenant-a',
      accountStatus: 'enabled',
    }),
  };
}

function settingsRepo(overrides: Partial<SystemSettings['defaults']> = {}) {
  const settings = buildDefaultSystemSettings();
  return {
    get: async () => ({
      ...settings,
      defaults: { ...settings.defaults, ...overrides },
    }),
    save: vi.fn(),
  };
}

/** A settings row written before the bounds existed. */
function legacySettingsRepo() {
  const settings = buildDefaultSystemSettings();
  const defaults = { ...settings.defaults } as Record<string, unknown>;
  delete defaults.walletTopUpMinKobo;
  delete defaults.walletTopUpMaxKobo;
  return { get: async () => ({ ...settings, defaults }), save: vi.fn() };
}

describe('TopupWalletUseCase amount bounds', () => {
  let topUps: { save: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    topUps = { save: vi.fn().mockResolvedValue(undefined) };
  });

  function build(settings: ReturnType<typeof settingsRepo>) {
    return new TopupWalletUseCase(
      tokenService() as never,
      userRepo() as never,
      topUps as never,
      settings as never,
    );
  }

  const payload = { amount: 5_000, mobileMoneyProvider: 'mtn_momo', mobileNumber: '+2348000000000' };

  it('accepts an amount inside the configured bounds', async () => {
    const result = await build(settingsRepo()).execute(TOKEN, payload);

    expect(result.data.amount).toBe(5_000);
    expect(topUps.save).toHaveBeenCalledTimes(1);
  });

  it('refuses an amount above the configured ceiling', async () => {
    const settings = settingsRepo({ walletTopUpMaxKobo: 100_000 });

    await expect(build(settings).execute(TOKEN, payload)).rejects.toBeInstanceOf(
      TopUpAmountOutOfRangeError,
    );
    expect(topUps.save).not.toHaveBeenCalled();
  });

  it('refuses an amount below the configured floor', async () => {
    const settings = settingsRepo({ walletTopUpMinKobo: 1_000_000 });

    await expect(build(settings).execute(TOKEN, payload)).rejects.toBeInstanceOf(
      TopUpAmountOutOfRangeError,
    );
  });

  it('follows the configured bounds rather than a fixed constant', async () => {
    const generous = settingsRepo({ walletTopUpMaxKobo: 99_000_000_000 });

    const result = await build(generous).execute(TOKEN, {
      ...payload,
      amount: 50_000_000,
    });

    expect(result.data.amount).toBe(50_000_000);
  });

  it('names the bounds in the refusal, so the caller can correct it', async () => {
    const settings = settingsRepo({ walletTopUpMinKobo: 10_000, walletTopUpMaxKobo: 100_000 });

    await expect(build(settings).execute(TOKEN, payload)).rejects.toThrow(
      /between 100 and 1000/,
    );
  });

  it('applies the default bounds to a settings row written before they existed', async () => {
    const result = await build(legacySettingsRepo() as never).execute(TOKEN, payload);

    expect(result.data.amount).toBe(5_000);
  });

  it('refuses an absurd amount on a legacy settings row', async () => {
    await expect(
      build(legacySettingsRepo() as never).execute(TOKEN, { ...payload, amount: 90_000_000 }),
    ).rejects.toBeInstanceOf(TopUpAmountOutOfRangeError);
  });
});
