import { SYSTEM_TENANT_ID } from '@shared/identity';
import {
  INSTALLATION_JOB_CONTEXT,
  installerTicketChannel,
  installerTicketSubject,
  type InstallerSupportCategory,
  type InstallerTicketChip,
  type InstallerTicketPriority,
} from '@auth/installation/domain/installer-support';
import type { StoredInstallationOrder } from '@auth/installation/domain/installation-order.repository';
import type { StoredInstaller } from '@auth/installation/domain/installer.repository';
import type { StoredSupportTicket } from '../../../../../support-ticket.repository';
import type { ActivityLogService } from '../../../../../activity-log.service';
import type { SupportTicketNotifierService } from '../../../../../support-ticket-notifier.service';

export type InstallerTicketInput = {
  id: string;
  ticketNumber: number;
  installer: StoredInstaller;
  category: InstallerSupportCategory;
  chip: InstallerTicketChip | null;
  priority: InstallerTicketPriority;
  description: string;
  callbackPhone: string | null;
  job: StoredInstallationOrder | null;
  /** A job issue report, rather than a ticket that only mentions a job. */
  aboutJob: boolean;
  now: Date;
};

export function installerTicket(input: InstallerTicketInput): StoredSupportTicket {
  const { installer, job, now } = input;
  return {
    id: input.id,
    ticketNumber: input.ticketNumber,
    tenantId: SYSTEM_TENANT_ID,
    reporterType: 'installer',
    reporterId: installer.id,
    relatedTenantId: job?.tenantId ?? null,
    relatedOrderId: job?.id ?? null,
    issueCode: input.chip?.key ?? null,
    callbackPhone: input.callbackPhone,
    category: input.category,
    subject: installerTicketSubject(input.category, input.chip),
    description: input.description,
    status: 'open',
    priority: input.priority,
    channel: installerTicketChannel(input.category),
    otherChannel: null,
    contextType: input.aboutJob ? INSTALLATION_JOB_CONTEXT : 'none',
    contextId: input.aboutJob ? (job?.id ?? null) : null,
    contextSnapshot: null,
    escalatedTo: null,
    escalatedReferenceId: null,
    escalationNotes: null,
    escalatedAt: null,
    escalatedBy: null,
    assignedTo: null,
    createdBy: installer.userId ?? installer.id,
    resolvedAt: null,
    closedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

/** Tells the support desk under the system tenant, so no customer is billed, and records who raised it. */
export async function announceInstallerTicket(
  deps: { activity: ActivityLogService; notifier: SupportTicketNotifierService },
  installer: StoredInstaller,
  ticket: StoredSupportTicket,
  action: string,
): Promise<void> {
  await deps.notifier.notifyRaised(SYSTEM_TENANT_ID, ticket.id, { reporter_type: 'installer', related_order_id: ticket.relatedOrderId });
  await deps.activity.record({
    tenantId: SYSTEM_TENANT_ID,
    service: 'auth',
    action,
    entityType: 'support_ticket',
    entityId: ticket.id,
    summary: `${ticket.subject} raised by installer ${installer.code}`,
    actorId: installer.userId,
    actorRole: 'INSTALLER',
    actorEmail: installer.email,
    metadata: { ticketNumber: ticket.ticketNumber, relatedOrderId: ticket.relatedOrderId, relatedTenantId: ticket.relatedTenantId },
  });
}
