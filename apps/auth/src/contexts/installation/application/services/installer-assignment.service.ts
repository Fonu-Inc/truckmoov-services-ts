import { Inject, Injectable } from '@nestjs/common';
import { AppConfigService } from '@shared/config';
import { DEFAULT_MAX_ACTIVE_JOBS } from '@auth/installation/domain/installer';
import { chooseInstaller } from '@auth/installation/domain/assign-installer';
import { assignOrder } from '@auth/installation/domain/installation-order';
import {
  INSTALLATION_ORDER_REPOSITORY,
  type InstallationOrderRepository,
  type StoredInstallationOrder,
  type StoredOfferRejection,
} from '@auth/installation/domain/installation-order.repository';
import {
  INSTALLER_REPOSITORY,
  type InstallerRepository,
  type StoredInstaller,
} from '@auth/installation/domain/installer.repository';
import { tallyJobs } from '../use-cases/support/installer-admin.support';

export type Assignment = { order: StoredInstallationOrder; installer: StoredInstaller };

/**
 * Assigns one unassigned order to anyone but `excluded` (those who rejected it);
 * null when nobody can take it or another writer moved it.
 */
export type InstallerAssigner = (
  order: StoredInstallationOrder,
  now: Date,
  excluded?: ReadonlySet<string>,
) => Promise<Assignment | null>;

/** Who rejected each order. */
export function rejectersByOrder(rejections: StoredOfferRejection[]): Map<string, Set<string>> {
  const byOrder = new Map<string, Set<string>>();
  for (const { orderId, installerId } of rejections) {
    byOrder.set(orderId, (byOrder.get(orderId) ?? new Set()).add(installerId));
  }
  return byOrder;
}

/** Loads who can take work and how busy they are, once per booking or sweep. */
@Injectable()
export class InstallerAssignmentService {
  constructor(
    @Inject(INSTALLER_REPOSITORY) private readonly installers: InstallerRepository,
    @Inject(INSTALLATION_ORDER_REPOSITORY) private readonly orders: InstallationOrderRepository,
    // Optional only for direct domain/unit construction. Nest always supplies
    // this provider in the running application.
    @Inject(AppConfigService) private readonly config?: AppConfigService,
  ) {}

  /**
   * The load read here only ranks candidates; the write rechecks capacity under
   * a lock, so concurrent bookings and sweeps on other pods cannot overfill anyone.
   */
  async assigner(): Promise<InstallerAssigner> {
    const candidates = await this.installers.findActive();
    const tallies = tallyJobs(await this.orders.countByInstaller(candidates.map((c) => c.id)));
    const load = new Map([...tallies].map(([id, tally]) => [id, tally.active]));
    const maxActiveJobs = this.config?.fleet.installerMaxScheduledJobs ?? DEFAULT_MAX_ACTIVE_JOBS;

    return (order, now, excluded = new Set()) => this.assign(order, now, candidates, load, maxActiveJobs, new Set(excluded));
  }

  /**
   * Tries candidates in pick order. One found full is ranked out for every order;
   * one who turned this order down, found only at the write, for this order alone.
   */
  private async assign(
    order: StoredInstallationOrder,
    now: Date,
    candidates: StoredInstaller[],
    load: Map<string, number>,
    maxActiveJobs: number,
    excluded: Set<string>,
  ): Promise<Assignment | null> {
    let installer = chooseInstaller(candidates, order, load, excluded, maxActiveJobs);
    while (installer) {
      const assigned = assignOrder(order, installer.id, now);
      const outcome = await this.orders.assignIfRoom(assigned, maxActiveJobs);
      if (outcome === 'taken') return null;
      if (outcome === 'assigned') {
        load.set(installer.id, (load.get(installer.id) ?? 0) + 1);
        return { order: assigned, installer };
      }
      if (outcome === 'declined' || outcome === 'conflict') excluded.add(installer.id);
      else load.set(installer.id, maxActiveJobs);
      installer = chooseInstaller(candidates, order, load, excluded, maxActiveJobs);
    }
    return null;
  }
}
