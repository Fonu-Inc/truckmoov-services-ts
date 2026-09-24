import type { StoredOnboardingApplicationVehicle } from '@auth/onboarding/domain/onboarding-application.repository';

export type VerificationStartOutcome = 'started' | 'skipped' | 'refused' | 'missing';

export type VerificationStart = { deviceId: string; outcome: VerificationStartOutcome; reason?: string };

export type InstalledUnit = { deviceId: string; vehicle: StoredOnboardingApplicationVehicle };

export interface InstallationFleet {
  /** Skips devices already waiting or verified. Null when fleet could not be asked. */
  beginVerification(tenantId: string, deviceIds: string[]): Promise<VerificationStart[] | null>;
  /** Idempotent per registration. Throws FleetDeviceRefusedError or FleetUnavailableError. */
  handOver(tenantId: string, unit: InstalledUnit): Promise<void>;
}

export const INSTALLATION_FLEET = Symbol('INSTALLATION_FLEET');
