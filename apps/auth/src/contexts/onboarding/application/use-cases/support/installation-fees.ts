import {
  BILLING_SETTING_KEYS,
  type BillingSettingsRepository,
  type StoredBillingSetting,
} from '@auth/onboarding/domain/billing-settings.repository';
import {
  DEFAULT_INSTALLATION_FEE_PER_DEVICE_NGN,
  type InstallationFees,
} from '@auth/onboarding/domain/onboarding-order';

export function installationFeesFrom(
  stored: Record<string, StoredBillingSetting>,
): InstallationFees {
  const read = (key: string) =>
    stored[key]?.value ?? DEFAULT_INSTALLATION_FEE_PER_DEVICE_NGN;

  return {
    enterpriseNgn: read(BILLING_SETTING_KEYS.installationFeeEnterprise),
    ownerOperatorNgn: read(BILLING_SETTING_KEYS.installationFeeOwnerOperator),
  };
}

export async function loadInstallationFees(
  settings: BillingSettingsRepository,
): Promise<InstallationFees> {
  return installationFeesFrom(await settings.getAll());
}
