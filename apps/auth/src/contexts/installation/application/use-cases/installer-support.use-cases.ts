import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { TOKEN_SERVICE } from '@auth/session';
import type { TokenService } from '@auth/session/domain/ports/token-service.port';
import { validateNigerianPhone } from '@auth/onboarding/domain/onboarding-application.validation';
import {
  installerIssueCode,
  installerTicketCategory,
  installerTicketPriority,
  ticketDescription,
} from '@auth/installation/domain/installer-support';
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
import { InstallationJobNotFoundError } from '@auth/installation/domain/installation-job.errors';
import {
  INSTALLER_TICKET_FILES,
  type InstallerTicketFiles,
} from '@auth/installation/domain/ports/installer-ticket-files.port';
import {
  SUPPORT_TICKET_REPOSITORY,
  type StoredSupportTicket,
  type SupportTicketFilters,
  type SupportTicketRepository,
  type TicketReporter,
} from '../../../../support-ticket.repository';
import {
  SUPPORT_TICKET_ATTACHMENT_REPOSITORY,
  type SupportTicketAttachmentRepository,
} from '../../../../support-ticket-attachment.repository';
import { ActivityLogService } from '../../../../activity-log.service';
import { SupportTicketNotifierService } from '../../../../support-ticket-notifier.service';
import { currentInstaller } from './support/current-installer';
import { pageOf } from './support/paging';
import { announceInstallerTicket, installerTicket } from './support/installer-ticket';
import { toInstallerTicketDetail, toInstallerTicketItem } from './support/installer-ticket.views';

export type CreateInstallerTicketCommand = {
  category: unknown;
  issueCode?: unknown;
  relatedJobId?: string | null;
  priority: unknown;
  description: unknown;
  callbackPhone: unknown;
};

export type ListInstallerTicketsQuery = Pick<SupportTicketFilters, 'status' | 'category' | 'priority' | 'search'> & {
  page?: number;
  limit?: number;
};

function reporterOf(installer: StoredInstaller): TicketReporter {
  return { type: 'installer', id: installer.id };
}

function summaryCounts(byStatus: Record<string, number>) {
  const count = (...statuses: string[]) => statuses.reduce((sum, status) => sum + (byStatus[status] ?? 0), 0);
  return {
    total: Object.values(byStatus).reduce((sum, n) => sum + n, 0),
    open: count('open'),
    inProgress: count('in_progress'),
    escalated: count('escalated'),
    closed: count('resolved', 'closed'),
  };
}

/** The installer raises tickets and reads their own; replies and status belong to the support desk. */
@Injectable()
export class InstallerSupportUseCases {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokens: TokenService,
    @Inject(INSTALLER_REPOSITORY) private readonly installers: InstallerRepository,
    @Inject(INSTALLATION_ORDER_REPOSITORY) private readonly orders: InstallationOrderRepository,
    @Inject(SUPPORT_TICKET_REPOSITORY) private readonly tickets: SupportTicketRepository,
    @Inject(SUPPORT_TICKET_ATTACHMENT_REPOSITORY) private readonly attachments: SupportTicketAttachmentRepository,
    @Inject(INSTALLER_TICKET_FILES) private readonly files: InstallerTicketFiles,
    @Inject(SupportTicketNotifierService) private readonly notifier: SupportTicketNotifierService,
    @Inject(ActivityLogService) private readonly activity: ActivityLogService,
  ) {}

  async create(accessToken: string, command: CreateInstallerTicketCommand, now: Date = new Date()) {
    const installer = await this.installer(accessToken);
    const category = installerTicketCategory(command.category);
    const chip = installerIssueCode(category, command.issueCode);
    const priority = installerTicketPriority(command.priority);
    const description = ticketDescription(command.description);
    const callbackPhone = validateNigerianPhone(command.callbackPhone, 'callbackPhone');
    const job = command.relatedJobId ? await this.ownJob(installer, command.relatedJobId) : null;

    const ticket = installerTicket({
      id: randomUUID(),
      ticketNumber: await this.tickets.nextTicketNumber(),
      installer, category, chip, priority, description, callbackPhone, job, aboutJob: false, now,
    });
    await this.tickets.save(ticket);
    await announceInstallerTicket({ activity: this.activity, notifier: this.notifier }, installer, ticket, 'installer.support_ticket.created');
    return this.detailOf(installer, ticket);
  }

  async list(accessToken: string, query: ListInstallerTicketsQuery) {
    const installer = await this.installer(accessToken);
    const { page, limit } = pageOf(query);
    const filters = { status: query.status, category: query.category, priority: query.priority, search: query.search };
    const [byStatus, found] = await Promise.all([
      this.tickets.countByStatusForReporter(reporterOf(installer)),
      this.tickets.findForReporter(reporterOf(installer), filters, { page, limit }),
    ]);
    return {
      counts: summaryCounts(byStatus),
      items: found.items.map((ticket) => toInstallerTicketItem(ticket, installer.fullName)),
      page,
      limit,
      total: found.total,
    };
  }

  async detail(accessToken: string, ticketId: string) {
    const installer = await this.installer(accessToken);
    return this.detailOf(installer, await this.ownTicket(installer, ticketId));
  }

  async attachmentLink(accessToken: string, ticketId: string, attachmentId: string) {
    const installer = await this.installer(accessToken);
    const ticket = await this.ownTicket(installer, ticketId);
    const attachment = (await this.attachments.findByTicketId(ticket.id)).find((a) => a.id === attachmentId);
    if (!attachment) throw new InstallationJobNotFoundError('Attachment not found');
    return {
      id: attachment.id,
      fileName: attachment.filename,
      size: attachment.sizeBytes,
      mimeType: attachment.contentType,
      url: await this.files.downloadUrl(attachment.key),
    };
  }

  private installer(accessToken: string): Promise<StoredInstaller> {
    return currentInstaller({ tokens: this.tokens, installers: this.installers }, accessToken);
  }

  private async ownJob(installer: StoredInstaller, jobId: string): Promise<StoredInstallationOrder> {
    const order = await this.orders.findById(jobId);
    if (!order || order.installerId !== installer.id) throw new InstallationJobNotFoundError();
    return order;
  }

  private async ownTicket(installer: StoredInstaller, ticketId: string): Promise<StoredSupportTicket> {
    const ticket = await this.tickets.findById(ticketId);
    if (!ticket || ticket.reporterType !== 'installer' || ticket.reporterId !== installer.id) {
      throw new InstallationJobNotFoundError('Ticket not found');
    }
    return ticket;
  }

  private async detailOf(installer: StoredInstaller, ticket: StoredSupportTicket) {
    const [relatedJob, attachments] = await Promise.all([
      ticket.relatedOrderId ? this.orders.findById(ticket.relatedOrderId) : null,
      this.attachments.findByTicketId(ticket.id),
    ]);
    return toInstallerTicketDetail({ ticket, reporter: installer.fullName, relatedJob, attachments });
  }
}
