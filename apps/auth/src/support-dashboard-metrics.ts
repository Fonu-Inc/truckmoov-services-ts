import type { StoredSupportTicket } from './support-ticket.repository';
import type { StoredSupportMessage } from './support-message.repository';

/** Unresolved for longer than this and the ticket is breaching. */
export const SLA_BREACH_AFTER_MS = 24 * 60 * 60 * 1000;

/** Open with nobody having replied for longer than this is a first-response backlog. */
export const FIRST_RESPONSE_AFTER_MS = 2 * 60 * 60 * 1000;

/** Statuses that mean work is still owed on the ticket. */
export const UNRESOLVED_STATUSES: readonly string[] = [
  'open',
  'in_progress',
  'waiting_on_tenant',
  'escalated',
];

/** Statuses counted as the team's current load. */
export const ACTIVE_WORKLOAD_STATUSES: readonly string[] = ['open', 'in_progress', 'escalated'];

export const TOP_PRIORITIES: readonly string[] = ['critical', 'high'];

export type SupportDashboardMetrics = {
  activeWorkload: number;
  criticalHigh: number;
  slaBreaching: number;
  firstResponseBacklog: number;
  awaitingTenant: number;
  avgResolutionHours: number | null;
  avgResolutionMinutes: number | null;
  resolvedLast7Days: number;
};

export function isUnresolved(ticket: Pick<StoredSupportTicket, 'status'>): boolean {
  return UNRESOLVED_STATUSES.includes(ticket.status);
}

/**
 * Tickets nobody has answered yet.
 *
 * "Answered" means a reply from someone other than the person who raised it.
 * A reporter adding detail to their own ticket is not a first response, and
 * counting it as one would empty this card while nobody had actually replied.
 */
export function awaitingFirstResponse(
  ticket: StoredSupportTicket,
  messages: StoredSupportMessage[],
  now: number,
): boolean {
  if (ticket.status !== 'open') return false;
  if (now - ticket.createdAt.getTime() < FIRST_RESPONSE_AFTER_MS) return false;

  return !messages.some((message) => message.senderId !== ticket.createdBy);
}

export function isSlaBreaching(ticket: StoredSupportTicket, now: number): boolean {
  if (!isUnresolved(ticket)) return false;
  return now - ticket.createdAt.getTime() > SLA_BREACH_AFTER_MS;
}

/**
 * Mean time from raised to resolved, over tickets that actually resolved.
 *
 * Null when none have. An average over nothing is not a number worth showing,
 * and zero would read as instant resolution.
 */
function averageResolutionMs(tickets: StoredSupportTicket[]): number | null {
  const resolved = tickets.filter((ticket) => ticket.resolvedAt !== null);
  if (resolved.length === 0) return null;

  const totalMs = resolved.reduce(
    (total, ticket) => total + (ticket.resolvedAt!.getTime() - ticket.createdAt.getTime()),
    0,
  );
  return totalMs / resolved.length;
}

/** Two decimals: one would round anything under three minutes to zero. */
export function averageResolutionHours(tickets: StoredSupportTicket[]): number | null {
  const ms = averageResolutionMs(tickets);
  return ms === null ? null : Math.round((ms / 3_600_000) * 100) / 100;
}

export function averageResolutionMinutes(tickets: StoredSupportTicket[]): number | null {
  const ms = averageResolutionMs(tickets);
  return ms === null ? null : Math.round(ms / 60_000);
}

export function resolvedWithinDays(
  tickets: StoredSupportTicket[],
  days: number,
  now: number,
): number {
  const since = now - days * 24 * 60 * 60 * 1000;
  return tickets.filter(
    (ticket) => ticket.resolvedAt !== null && ticket.resolvedAt.getTime() >= since,
  ).length;
}

export function buildDashboardMetrics(input: {
  tickets: StoredSupportTicket[];
  messagesByTicketId: Map<string, StoredSupportMessage[]>;
  now?: number;
}): SupportDashboardMetrics {
  const now = input.now ?? Date.now();
  const { tickets } = input;

  return {
    activeWorkload: tickets.filter((ticket) => ACTIVE_WORKLOAD_STATUSES.includes(ticket.status))
      .length,
    criticalHigh: tickets.filter(
      (ticket) => isUnresolved(ticket) && TOP_PRIORITIES.includes(ticket.priority),
    ).length,
    slaBreaching: tickets.filter((ticket) => isSlaBreaching(ticket, now)).length,
    firstResponseBacklog: tickets.filter((ticket) =>
      awaitingFirstResponse(ticket, input.messagesByTicketId.get(ticket.id) ?? [], now),
    ).length,
    awaitingTenant: tickets.filter((ticket) => ticket.status === 'waiting_on_tenant').length,
    avgResolutionHours: averageResolutionHours(tickets),
    avgResolutionMinutes: averageResolutionMinutes(tickets),
    resolvedLast7Days: resolvedWithinDays(tickets, 7, now),
  };
}
