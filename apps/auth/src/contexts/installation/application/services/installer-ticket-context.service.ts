import { Inject, Injectable } from '@nestjs/common';
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
import type { StoredSupportTicket } from '../../../../support-ticket.repository';
import { toRelatedJob } from '../use-cases/support/installer-ticket.views';

export type InstallerTicketFacts = {
  reporterName: string | null;
  relatedJob: { id: string; jobNumber: string } | null;
};

async function byId<T extends { id: string }>(ids: string[], find: (id: string) => Promise<T | null>): Promise<Map<string, T>> {
  const found = await Promise.all([...new Set(ids)].map(find));
  return new Map(found.flatMap((item) => (item ? [[item.id, item] as const] : [])));
}

/** Who raised each installer ticket and which job it is about, for the support desk. */
@Injectable()
export class InstallerTicketContextService {
  constructor(
    @Inject(INSTALLER_REPOSITORY) private readonly installers: InstallerRepository,
    @Inject(INSTALLATION_ORDER_REPOSITORY) private readonly orders: InstallationOrderRepository,
  ) {}

  async describe(tickets: StoredSupportTicket[]): Promise<Map<string, InstallerTicketFacts>> {
    const mine = tickets.filter((ticket) => ticket.reporterType === 'installer');
    const [installers, orders] = await Promise.all([
      byId<StoredInstaller>(mine.flatMap((t) => (t.reporterId ? [t.reporterId] : [])), (id) => this.installers.findById(id)),
      byId<StoredInstallationOrder>(mine.flatMap((t) => (t.relatedOrderId ? [t.relatedOrderId] : [])), (id) => this.orders.findById(id)),
    ]);
    return new Map(
      mine.map((ticket) => [
        ticket.id,
        {
          reporterName: installers.get(ticket.reporterId ?? '')?.fullName ?? null,
          relatedJob: toRelatedJob(orders.get(ticket.relatedOrderId ?? '') ?? null),
        },
      ]),
    );
  }
}
