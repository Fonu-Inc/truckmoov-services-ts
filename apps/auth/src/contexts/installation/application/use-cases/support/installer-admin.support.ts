import {
  OnboardingValidationError,
  validateBusinessEmail,
  validateCity,
  validateNigerianPhone,
} from '@auth/onboarding/domain/onboarding-application.validation';
import { requireState } from '@shared/nigeria';
import {
  DEFAULT_MAX_ACTIVE_JOBS,
  MAX_ACTIVE_JOBS_LIMIT,
  availabilityOf,
  installerFullName,
  isInstallerCapability,
  type InstallerCapability,
} from '@auth/installation/domain/installer';
import type { StoredInstaller } from '@auth/installation/domain/installer.repository';
import type { InstallerJobCount } from '@auth/installation/domain/installation-order.repository';
import { ACTIVE_JOB_STATUSES } from '@auth/installation/domain/installation-order';

export type InstallerDetailsInput = {
  firstName?: unknown;
  lastName?: unknown;
  phoneNumber?: unknown;
  state?: unknown;
  city?: unknown;
  serviceAreas?: unknown;
  capabilities?: unknown;
  maxActiveJobs?: unknown;
};

type InstallerDetails = Pick<
  StoredInstaller,
  'firstName' | 'lastName' | 'fullName' | 'phoneNumber' | 'state' | 'city' | 'serviceAreas' | 'capabilities' | 'maxActiveJobs'
>;

export type JobTally = { active: number; completed: number };

const NO_JOBS: JobTally = { active: 0, completed: 0 };

export function personName(field: string, value: unknown): string {
  const name = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (name.length < 1 || name.length > 60) {
    throw new OnboardingValidationError(field, `${field} must be between 1 and 60 characters`);
  }
  return name;
}

function list(field: string, value: unknown): string[] {
  if (!Array.isArray(value)) throw new OnboardingValidationError(field, `${field} must be a list`);
  return [...new Set(value.map((item) => String(item ?? '').trim()))];
}

function serviceAreas(value: unknown): string[] {
  const areas = [...new Set(list('serviceAreas', value).map((area) => requireState(area, 'serviceAreas')))];
  if (areas.length === 0) {
    throw new OnboardingValidationError('serviceAreas', 'At least one service area is required');
  }
  return areas;
}

function capabilities(value: unknown): InstallerCapability[] {
  const items = list('capabilities', value);
  const unknown = items.filter((item) => !isInstallerCapability(item));
  if (unknown.length > 0) {
    throw new OnboardingValidationError('capabilities', `Unknown capabilities: ${unknown.join(', ')}`);
  }
  return items as InstallerCapability[];
}

function maxActiveJobs(value: unknown): number {
  const jobs = Number(value);
  if (!Number.isInteger(jobs) || jobs < 1 || jobs > MAX_ACTIVE_JOBS_LIMIT) {
    throw new OnboardingValidationError('maxActiveJobs', `maxActiveJobs must be between 1 and ${MAX_ACTIVE_JOBS_LIMIT}`);
  }
  return jobs;
}

export function installerEmail(value: unknown): string {
  try {
    return validateBusinessEmail(value);
  } catch {
    throw new OnboardingValidationError('email', 'Email is not a valid address');
  }
}

/** Every detail an admin sets when adding an installer. */
export function newInstallerDetails(input: InstallerDetailsInput): InstallerDetails {
  const firstName = personName('firstName', input.firstName);
  const lastName = personName('lastName', input.lastName);
  const areas = serviceAreas(input.serviceAreas);
  return {
    firstName,
    lastName,
    fullName: installerFullName(firstName, lastName),
    phoneNumber: validateNigerianPhone(input.phoneNumber, 'phoneNumber'),
    // State/city were introduced after installer records already existed.
    // When supplied they are strictly validated; older calls derive the home
    // state from the (also validated) first service area.
    state: input.state === undefined ? areas[0] : requireState(input.state),
    city: input.city === undefined ? null : validateCity(input.city),
    serviceAreas: areas,
    capabilities: capabilities(input.capabilities),
    maxActiveJobs: input.maxActiveJobs === undefined ? DEFAULT_MAX_ACTIVE_JOBS : maxActiveJobs(input.maxActiveJobs),
  };
}

/** The installer with only the details the admin sent changed. */
export function editedInstaller(installer: StoredInstaller, input: InstallerDetailsInput): StoredInstaller {
  const firstName = input.firstName === undefined ? installer.firstName : personName('firstName', input.firstName);
  const lastName = input.lastName === undefined ? installer.lastName : personName('lastName', input.lastName);
  return {
    ...installer,
    firstName,
    lastName,
    fullName: installerFullName(firstName, lastName),
    phoneNumber:
      input.phoneNumber === undefined ? installer.phoneNumber : validateNigerianPhone(input.phoneNumber, 'phoneNumber'),
    state: input.state === undefined ? installer.state : requireState(input.state),
    city: input.city === undefined ? installer.city : validateCity(input.city),
    serviceAreas: input.serviceAreas === undefined ? installer.serviceAreas : serviceAreas(input.serviceAreas),
    capabilities: input.capabilities === undefined ? installer.capabilities : capabilities(input.capabilities),
    maxActiveJobs: input.maxActiveJobs === undefined ? installer.maxActiveJobs : maxActiveJobs(input.maxActiveJobs),
  };
}

export function tallyJobs(rows: InstallerJobCount[]): Map<string, JobTally> {
  const tallies = new Map<string, JobTally>();
  for (const row of rows) {
    const tally = tallies.get(row.installerId) ?? { ...NO_JOBS };
    if (ACTIVE_JOB_STATUSES.includes(row.status)) tally.active += row.count;
    if (row.status === 'completed') tally.completed += row.count;
    tallies.set(row.installerId, tally);
  }
  return tallies;
}

export function toInstallerView(
  installer: StoredInstaller,
  jobs: JobTally = NO_JOBS,
  maxActiveJobs: number = installer.maxActiveJobs,
) {
  return {
    id: installer.id,
    code: installer.code,
    firstName: installer.firstName,
    lastName: installer.lastName,
    fullName: installer.fullName,
    email: installer.email,
    phoneNumber: installer.phoneNumber,
    state: installer.state,
    city: installer.city,
    serviceAreas: installer.serviceAreas,
    capabilities: installer.capabilities,
    availability: availabilityOf({ ...installer, maxActiveJobs }, jobs.active),
    status: installer.status,
    activeJobs: jobs.active,
    maxActiveJobs,
    jobsCompleted: jobs.completed,
    createdAt: installer.createdAt.toISOString(),
    lastActivityAt: installer.lastActivityAt?.toISOString() ?? null,
  };
}
