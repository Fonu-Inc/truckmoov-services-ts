import { describe, expect, it } from "vitest";
import {
  canDebit,
  walletCreditFloorKobo,
  walletStatus,
  type WalletCreditSettings,
} from "../../../apps/auth/src/wallet-credit";

const NAIRA = 100;

function settings(overrides: Partial<WalletCreditSettings> = {}): WalletCreditSettings {
  return {
    creditEnabled: false,
    creditLimitKobo: null,
    lowBalanceThresholdKobo: 200_000 * NAIRA,
    ...overrides,
  };
}

describe("Wallet credit floor", () => {
  it("stops at zero when credit is off", () => {
    expect(walletCreditFloorKobo(settings())).toBe(0);
  });

  it("ignores a limit when credit is off", () => {
    // The toggle decides whether negative is possible at all.
    expect(
      walletCreditFloorKobo(settings({ creditEnabled: false, creditLimitKobo: 50_000 * NAIRA })),
    ).toBe(0);
  });

  it("treats an unset limit as unlimited, not zero", () => {
    // Reading an unset limit as zero would refuse every tenant nobody has
    // configured yet.
    expect(
      walletCreditFloorKobo(settings({ creditEnabled: true, creditLimitKobo: null })),
    ).toBe(Number.NEGATIVE_INFINITY);
  });

  it("gives no headroom when credit is on with a zero limit", () => {
    expect(
      walletCreditFloorKobo(settings({ creditEnabled: true, creditLimitKobo: 0 })),
    ).toBe(0);
  });

  it("allows the balance down to minus the limit", () => {
    expect(
      walletCreditFloorKobo(settings({ creditEnabled: true, creditLimitKobo: 50_000 * NAIRA })),
    ).toBe(-50_000 * NAIRA);
  });
});

describe("Debit permission", () => {
  it("allows a debit the balance covers", () => {
    expect(canDebit(10_000 * NAIRA, 4_000 * NAIRA, settings())).toBe(true);
  });

  it("refuses a debit that would go below zero without credit", () => {
    expect(canDebit(3_000 * NAIRA, 4_000 * NAIRA, settings())).toBe(false);
  });

  it("allows a debit inside the credit limit", () => {
    const withCredit = settings({ creditEnabled: true, creditLimitKobo: 50_000 * NAIRA });

    expect(canDebit(3_000 * NAIRA, 20_000 * NAIRA, withCredit)).toBe(true);
  });

  it("refuses the debit that would break the credit limit", () => {
    const withCredit = settings({ creditEnabled: true, creditLimitKobo: 50_000 * NAIRA });

    // Balance would land at -50,001, one naira past the ceiling.
    expect(canDebit(0, 50_001 * NAIRA, withCredit)).toBe(false);
    // Landing exactly on the limit is still allowed.
    expect(canDebit(0, 50_000 * NAIRA, withCredit)).toBe(true);
  });

  it("refuses everything when credit is on with a zero limit", () => {
    const noHeadroom = settings({ creditEnabled: true, creditLimitKobo: 0 });

    expect(canDebit(0, 1, noHeadroom)).toBe(false);
    expect(canDebit(5_000 * NAIRA, 5_000 * NAIRA, noHeadroom)).toBe(true);
  });

  it("allows any debit on unlimited credit", () => {
    const unlimited = settings({ creditEnabled: true, creditLimitKobo: null });

    expect(canDebit(0, 10_000_000 * NAIRA, unlimited)).toBe(true);
  });
});

describe("Wallet status", () => {
  it("reads healthy above the tenant's own threshold", () => {
    expect(walletStatus(300_000 * NAIRA, settings())).toBe("healthy");
  });

  it("reads low below the tenant's own threshold", () => {
    expect(walletStatus(150_000 * NAIRA, settings())).toBe("low");
  });

  it("uses each tenant's threshold, not one platform figure", () => {
    const balance = 300_000 * NAIRA;

    // The same balance is healthy for one tenant and low for another. A single
    // global threshold would label one of them wrongly.
    expect(walletStatus(balance, settings({ lowBalanceThresholdKobo: 200_000 * NAIRA }))).toBe(
      "healthy",
    );
    expect(walletStatus(balance, settings({ lowBalanceThresholdKobo: 500_000 * NAIRA }))).toBe(
      "low",
    );
  });

  it("reads negative once the balance passes zero", () => {
    expect(walletStatus(-1, settings({ creditEnabled: true }))).toBe("negative");
  });

  it("reads low, not healthy, at exactly the threshold", () => {
    expect(walletStatus(200_000 * NAIRA, settings())).toBe("healthy");
    expect(walletStatus(200_000 * NAIRA - 1, settings())).toBe("low");
  });
});
