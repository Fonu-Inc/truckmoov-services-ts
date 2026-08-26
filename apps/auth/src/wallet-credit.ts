export const WALLET_STATUSES = ['healthy', 'low', 'negative'] as const;

export type WalletStatus = (typeof WALLET_STATUSES)[number];

export type WalletCreditSettings = {
  /** Whether the balance may go below zero at all. */
  creditEnabled: boolean;
  /**
   * How far below zero the balance may go, in kobo.
   *
   * Null means unlimited, not zero. The requirements are explicit that treating
   * an unset limit as zero would refuse every tenant nobody has configured.
   */
  creditLimitKobo: number | null;
  /** Below this the wallet reads as Low. Per tenant, never a platform constant. */
  lowBalanceThresholdKobo: number;
};

export const DEFAULT_LOW_BALANCE_THRESHOLD_KOBO = 200_000 * 100;

/**
 * The lowest balance this wallet may reach.
 *
 * The requirements flag that credit enabled with a zero limit and credit
 * disabled with a zero limit both occur, and ask for defined behaviour. They
 * are defined here, and they differ only in intent:
 *
 * - credit disabled — the floor is zero whatever the limit says.
 * - credit enabled, limit null — no floor. Unset means unlimited.
 * - credit enabled, limit zero — the floor is zero. Credit is permitted in
 *   principle and the tenant has been given no headroom, so nothing may go
 *   through until someone sets a limit.
 * - credit enabled, limit N — the floor is minus N.
 */
export function walletCreditFloorKobo(settings: WalletCreditSettings): number {
  if (!settings.creditEnabled) return 0;
  if (settings.creditLimitKobo === null) return Number.NEGATIVE_INFINITY;
  const limit = Math.abs(settings.creditLimitKobo);
  return limit === 0 ? 0 : -limit;
}

/** Whether a debit of this size may go through against this balance. */
export function canDebit(
  balanceKobo: number,
  amountKobo: number,
  settings: WalletCreditSettings,
): boolean {
  return balanceKobo - amountKobo >= walletCreditFloorKobo(settings);
}

/**
 * What the wallet reads as.
 *
 * Judged against this tenant's own threshold. A single platform-wide figure
 * would label most wallets wrongly, because the thresholds differ by an order
 * of magnitude across tenants.
 */
export function walletStatus(
  balanceKobo: number,
  settings: WalletCreditSettings,
): WalletStatus {
  if (balanceKobo < 0) return 'negative';
  if (balanceKobo < settings.lowBalanceThresholdKobo) return 'low';
  return 'healthy';
}
