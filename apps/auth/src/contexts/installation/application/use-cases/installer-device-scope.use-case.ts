import { Inject, Injectable } from '@nestjs/common';
import { lagosDayAt } from '@shared/devices';
import { ACTIVE_JOB_STATUSES } from '@auth/installation/domain/installation-order';
import {
  INSTALLATION_JOB_READER,
  type DeviceScopeEntry,
  type InstallationJobReader,
} from '@auth/installation/domain/installation-job.reader';

/**
 * The fleet devices an installer may read: every bound device on their open
 * jobs, plus those on jobs completed today in Lagos. Unknown or suspended
 * installers have none.
 */
@Injectable()
export class InstallerDeviceScopeUseCase {
  constructor(@Inject(INSTALLATION_JOB_READER) private readonly jobs: InstallationJobReader) {}

  forUser(userId: string, now: Date = new Date()): Promise<DeviceScopeEntry[]> {
    const today = lagosDayAt(now);
    return this.jobs.deviceScope({
      userId,
      statuses: ACTIVE_JOB_STATUSES,
      completedFrom: today.start,
      completedBefore: today.end,
    });
  }
}
