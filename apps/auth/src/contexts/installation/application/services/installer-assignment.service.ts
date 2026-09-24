import { Inject, Injectable } from '@nestjs/common';
import { chooseInstaller } from '@auth/installation/domain/assign-installer';
import { assignOrder } from '@auth/installation/domain/installation-order';
import {
  INSTALLATION_ORDER_REPOSITORY,
  type InstallationOrderRepository,
  type StoredInstallationOrder,
} from '@auth/installation/domain/installation-order.repository';
import {
  INSTALLER_REPOSITORY,
  type InstallerRepository,
  type StoredInstaller,
} from '@auth/installation/domain/installer.repository';
import { tallyJobs } from '../use-cases/support/installer-admin.support';

export type Assignment = { order: StoredInstallationOrder; installer: StoredInstaller };

/** Assigns one unassigned order; null when nobody can take it or another writer moved it. */
export type InstallerAssigner = (order: StoredInstallationOrder, now: Date) => Promise<Assignment | null>;

/** Loads who can take work and how busy they are, once per booking or sweep. */
@Injectable()
export class InstallerAssignmentService {
  constructor(
    @Inject(INSTALLER_REPOSITORY) private readonly installers: InstallerRepository,
    @Inject(INSTALLATION_ORDER_REPOSITORY) private readonly orders: InstallationOrderRepository,
  ) {}

  /**
   * The load read here only ranks candidates; the write rechecks capacity under
   * a lock, so concurrent bookings and sweeps on other pods cannot overfill anyone.
   */
  async assigner(): Promise<InstallerAssigner> {
    const candidates = await this.installers.findActive();
    const tallies = tallyJobs(await this.orders.countByInstaller(candidates.map((c) => c.id)));
    const load = new Map([...tallies].map(([id, tally]) => [id, tally.active]));

    return (order, now) => this.assign(order, now, candidates, load);
  }

  /** Tries candidates in pick order; one found full is ranked out and the next tried. */
  private async assign(
    order: StoredInstallationOrder,
    now: Date,
    candidates: StoredInstaller[],
    load: Map<string, number>,
  ): Promise<Assignment | null> {
    let installer = chooseInstaller(candidates, order.state, load);
    while (installer) {
      const assigned = assignOrder(order, installer.id, now);
      const outcome = await this.orders.assignIfRoom(assigned, installer.maxActiveJobs);
      if (outcome === 'taken') return null;
      if (outcome === 'assigned') {
        load.set(installer.id, (load.get(installer.id) ?? 0) + 1);
        return { order: assigned, installer };
      }
      load.set(installer.id, installer.maxActiveJobs);
      installer = chooseInstaller(candidates, order.state, load);
    }
    return null;
  }
}
