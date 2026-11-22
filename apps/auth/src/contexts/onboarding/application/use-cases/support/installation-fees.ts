import {
  BILLING_SETTING_KEYS,
  type BillingSettingsRepository,
  type StoredBillingSetting,
} from '@auth/onboarding/domain/billing-settings.repository';
import {
  DEFAULT_INSTALLATION_FEE_PER_DEVICE_NGN,
  DEFAULT_TELECOM_MASTER_SIM_NGN,
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

export function telecomMasterSimNgnFrom(
  stored: Record<string, StoredBillingSetting>,
): number {
  return stored[BILLING_SETTING_KEYS.telecomMasterSim]?.value ?? DEFAULT_TELECOM_MASTER_SIM_NGN;
}

export async function loadTelecomMasterSimNgn(
  settings: BillingSettingsRepository,
): Promise<number> {
  return telecomMasterSimNgnFrom(await settings.getAll());
}
