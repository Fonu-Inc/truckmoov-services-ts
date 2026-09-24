import {
  validateCity,
  validateNigerianPhone,
  validateState,
} from '@auth/onboarding/domain/onboarding-application.validation';
import { INSTALLER_CAPABILITIES, installerFullName } from '@auth/installation/domain/installer';
import type { StoredInstaller } from '@auth/installation/domain/installer.repository';
import { personName } from './installer-admin.support';

export type ProfileInput = {
  firstName?: unknown;
  lastName?: unknown;
  phoneNumber?: unknown;
  state?: unknown;
  city?: unknown;
};

function changed<T>(value: unknown, current: T, validate: (value: unknown) => T): T {
  return value === undefined ? current : validate(value);
}

/** The installer with only the personal details they sent changed. The record block is not theirs to edit. */
export function editedProfile(installer: StoredInstaller, input: ProfileInput): StoredInstaller {
  const firstName = changed(input.firstName, installer.firstName, (v) => personName('firstName', v));
  const lastName = changed(input.lastName, installer.lastName, (v) => personName('lastName', v));
  return {
    ...installer,
    firstName,
    lastName,
    fullName: installerFullName(firstName, lastName),
    phoneNumber: changed(input.phoneNumber, installer.phoneNumber, (v) => validateNigerianPhone(v, 'phoneNumber')),
    state: changed<string | null>(input.state, installer.state, validateState),
    city: changed<string | null>(input.city, installer.city, validateCity),
  };
}

export function toProfileView(installer: StoredInstaller, photoUrl: string | null) {
  return {
    personal: {
      firstName: installer.firstName,
      lastName: installer.lastName,
      email: installer.email,
      phoneNumber: installer.phoneNumber,
      state: installer.state,
      city: installer.city,
      photoUrl,
    },
    record: {
      code: installer.code,
      status: installer.status,
      serviceAreas: installer.serviceAreas,
      capabilities: installer.capabilities.map((key) => ({ key, label: INSTALLER_CAPABILITIES[key] ?? key })),
      createdAt: installer.createdAt.toISOString(),
    },
  };
}
