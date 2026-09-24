import {
  INSTALLER_FIELD_TIPS,
  INSTALLER_PRIORITY_LABELS,
  INSTALLER_SUPPORT_CATEGORIES,
  INSTALLER_TICKET_STATUS_LABELS,
  installerCategoryLabel,
} from '@auth/installation/domain/installer-support';
import type { StoredInstallationOrder } from '@auth/installation/domain/installation-order.repository';
import { ticketDisplayId, type StoredSupportTicket } from '../../../../../support-ticket.repository';
import type { StoredSupportTicketAttachment } from '../../../../../support-ticket-attachment.repository';

const statusLabel = (status: string) => INSTALLER_TICKET_STATUS_LABELS[status] ?? status;

export function toInstallerTicketItem(ticket: StoredSupportTicket, reporter: string) {
  return {
    id: ticket.id,
    displayId: ticketDisplayId(ticket.ticketNumber),
    title: ticket.subject,
    message: ticket.description,
    reporter,
    channel: ticket.channel,
    category: ticket.category,
    categoryLabel: installerCategoryLabel(ticket.category),
    status: ticket.status,
    statusLabel: statusLabel(ticket.status),
    priority: ticket.priority,
    createdAt: ticket.createdAt.toISOString(),
  };
}

export function toRelatedJob(order: StoredInstallationOrder | null) {
  return order ? { id: order.id, jobNumber: order.orderNumber } : null;
}

export function toInstallerTicketDetail(parts: {
  ticket: StoredSupportTicket;
  reporter: string;
  relatedJob: StoredInstallationOrder | null;
  attachments: StoredSupportTicketAttachment[];
}) {
  const { ticket } = parts;
  return {
    id: ticket.id,
    title: ticket.subject,
    displayId: ticketDisplayId(ticket.ticketNumber),
    category: ticket.category,
    categoryLabel: installerCategoryLabel(ticket.category),
    priority: ticket.priority,
    channel: ticket.channel,
    reporter: parts.reporter,
    createdAt: ticket.createdAt.toISOString(),
    status: ticket.status,
    statusLabel: statusLabel(ticket.status),
    description: ticket.description,
    relatedJob: toRelatedJob(parts.relatedJob),
    attachments: parts.attachments.map((a) => ({ id: a.id, fileName: a.filename, size: a.sizeBytes, mimeType: a.contentType })),
  };
}

export function toJobIssueView(ticket: StoredSupportTicket) {
  return {
    ticketId: ticket.id,
    displayId: ticketDisplayId(ticket.ticketNumber),
    status: ticket.status,
    createdAt: ticket.createdAt.toISOString(),
  };
}

export function installerSupportOptions() {
  const categories = Object.entries(INSTALLER_SUPPORT_CATEGORIES).map(([key, category]) => ({
    key,
    label: category.label,
    description: category.description,
    chips: category.chips,
  }));
  return {
    supportCategories: categories,
    fieldTips: INSTALLER_FIELD_TIPS,
    priorities: Object.entries(INSTALLER_PRIORITY_LABELS).map(([key, label]) => ({ key, label })),
    ticketStatuses: Object.entries(INSTALLER_TICKET_STATUS_LABELS).map(([key, label]) => ({ key, label })),
    jobIssueTypes: categories.map(({ key, label }) => ({ key, label })),
  };
}
