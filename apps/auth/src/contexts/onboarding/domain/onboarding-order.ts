import type { StoredM2mLicensePlan } from './m2m-license-plan.repository';

/**
 * What installing one device costs.
 *
 * FIX: hard-coded until platform admin billing owns this. The designs show
 * ₦60,000 against a four-device order, which is this figure per device; a flat
 * fee would charge a single-vehicle owner operator the same as a fleet.
 */
export const INSTALLATION_FEE_PER_DEVICE_NGN = 15_000;

export type OnboardingOrderSummary = {
  planCode: string;
  planName: string;
  deviceCount: number;
  perDeviceNgn: number;
  devicesNgn: number;
  installationNgn: number;
  totalNgn: number;
  /** What the same fleet costs to renew, shown before anyone commits. */
  renewalPerDeviceNgn: number;
};

/**
 * Prices an application from what it asked for.
 *
 * The client sends a selection, never a total. Everything charged is computed
 * here from the plan and the device rows on the application, so a tampered
 * request buys nothing.
 */
export function buildOrderSummary(
  plan: StoredM2mLicensePlan,
  deviceCount: number,
): OnboardingOrderSummary {
  const devicesNgn = plan.perDeviceYear1Ngn * deviceCount;
  const installationNgn = INSTALLATION_FEE_PER_DEVICE_NGN * deviceCount;

  return {
    planCode: plan.code,
    planName: plan.name,
    deviceCount,
    perDeviceNgn: plan.perDeviceYear1Ngn,
    devicesNgn,
    installationNgn,
    totalNgn: devicesNgn + installationNgn,
    renewalPerDeviceNgn: plan.perDeviceRenewalNgn,
  };
}

export function toKobo(amountNgn: number): number {
  return Math.round(amountNgn * 100);
}
