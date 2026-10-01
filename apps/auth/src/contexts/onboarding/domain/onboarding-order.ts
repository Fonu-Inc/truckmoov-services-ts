import type { OnboardingApplicantType } from './onboarding-application.repository';
import type { StoredM2mLicensePlan } from './m2m-license-plan.repository';
import { computeTotals, koboToNgn } from './quotation-totals';

/**
 * What installing one device costs when no price has been set.
 *
 * The live figure is a billing setting; this is only the starting value and
 * the fallback for an install that has not been seeded.
 */
export const DEFAULT_INSTALLATION_FEE_PER_DEVICE_NGN = 15_000;

export type InstallationFees = {
  enterpriseNgn: number;
  ownerOperatorNgn: number;
};

export function installationFeeFor(
  applicantType: OnboardingApplicantType,
  fees: InstallationFees,
): number {
  return applicantType === 'owner_operator'
    ? fees.ownerOperatorNgn
    : fees.enterpriseNgn;
}

export type OnboardingOrderSummary = {
  planCode: string;
  planName: string;
  deviceCount: number;
  perDeviceNgn: number;
  devicesNgn: number;
  installationNgn: number;
  installationPerDeviceNgn: number;
  subtotalNgn: number;
  taxRateBp: number;
  taxNgn: number;
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
  installationFeePerDeviceNgn: number,
  taxRateBp = 0,
): OnboardingOrderSummary {
  const devicesNgn = plan.perDeviceYear1Ngn * deviceCount;
  const installationNgn = installationFeePerDeviceNgn * deviceCount;
  const totals = computeTotals(
    [
      { quantity: deviceCount, unitPriceKobo: toKobo(plan.perDeviceYear1Ngn) },
      { quantity: deviceCount, unitPriceKobo: toKobo(installationFeePerDeviceNgn) },
    ],
    0,
    taxRateBp,
  );

  return {
    planCode: plan.code,
    planName: plan.name,
    deviceCount,
    perDeviceNgn: plan.perDeviceYear1Ngn,
    devicesNgn,
    installationNgn,
    installationPerDeviceNgn: installationFeePerDeviceNgn,
    subtotalNgn: koboToNgn(totals.subtotalKobo),
    taxRateBp,
    taxNgn: koboToNgn(totals.taxKobo),
    totalNgn: koboToNgn(totals.totalKobo),
    renewalPerDeviceNgn: plan.perDeviceRenewalNgn,
  };
}

export function toKobo(amountNgn: number): number {
  return Math.round(amountNgn * 100);
}
