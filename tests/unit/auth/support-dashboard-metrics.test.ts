import { describe, expect, it } from 'vitest';
import {
  averageResolutionHours,
  awaitingFirstResponse,
  buildDashboardMetrics,
  isSlaBreaching,
  resolvedWithinDays,
} from '../../../apps/auth/src/support-dashboard-metrics';
import { TENANT_USER_REPORTER, type StoredSupportTicket } from '../../../apps/auth/src/support-ticket.repository';
import type { StoredSupportMessage } from '../../../apps/auth/src/support-message.repository';

const NOW = Date.parse('2026-09-07T12:00:00.000Z');

function hoursAgo(hours: number): Date {
  return new Date(NOW - hours * 3_600_000);
}

function ticket(overrides: Partial<StoredSupportTicket> = {}): StoredSupportTicket {
  return {
    id: 'tkt-1',
    ticketNumber: 1000,
    tenantId: 'tenant-1',
    ...TENANT_USER_REPORTER,
    category: 'device_tracking',
    subject: 'GPS tracker offline',
    description: 'Stopped reporting',
    status: 'open',
    priority: 'medium',
    channel: 'device',
    otherChannel: null,
    contextType: 'none',
    contextId: null,
    contextSnapshot: null,
    escalatedTo: null,
    escalatedReferenceId: null,
    escalationNotes: null,
    escalatedAt: null,
    escalatedBy: null,
    assignedTo: null,
    createdBy: 'user-1',
    resolvedAt: null,
    closedAt: null,
    createdAt: hoursAgo(1),
    updatedAt: hoursAgo(1),
    ...overrides,
  };
}

function message(overrides: Partial<StoredSupportMessage> = {}): StoredSupportMessage {
  return {
    id: 'msg-1',
    ticketId: 'tkt-1',
    senderId: 'agent-1',
    senderName: 'Support',
    senderRole: 'SYSTEM_ADMIN',
    message: 'Looking into it',
    isInternal: false,
    createdAt: hoursAgo(1),
    ...overrides,
  };
}

describe('SLA breach', () => {
  it('breaches once an unresolved ticket passes 24 hours', () => {
    expect(isSlaBreaching(ticket({ createdAt: hoursAgo(25) }), NOW)).toBe(true);
    expect(isSlaBreaching(ticket({ createdAt: hoursAgo(23) }), NOW)).toBe(false);
  });

  // A ticket that took three days but is finished is not still breaching.
  it('does not breach on a ticket that has been resolved or closed', () => {
    for (const status of ['resolved', 'closed']) {
      expect(isSlaBreaching(ticket({ status, createdAt: hoursAgo(72) }), NOW)).toBe(false);
    }
  });

  it('counts escalated and waiting-on-tenant as still owed', () => {
    for (const status of ['escalated', 'waiting_on_tenant', 'in_progress']) {
      expect(isSlaBreaching(ticket({ status, createdAt: hoursAgo(30) }), NOW)).toBe(true);
    }
  });
});

describe('First-response backlog', () => {
  it('counts an open ticket with no reply after two hours', () => {
    expect(awaitingFirstResponse(ticket({ createdAt: hoursAgo(3) }), [], NOW)).toBe(true);
  });

  it('gives a new ticket its two hours first', () => {
    expect(awaitingFirstResponse(ticket({ createdAt: hoursAgo(1) }), [], NOW)).toBe(false);
  });

  it('clears once somebody has replied', () => {
    expect(awaitingFirstResponse(ticket({ createdAt: hoursAgo(3) }), [message()], NOW)).toBe(false);
  });

  // The reporter adding detail to their own ticket is not a first response.
  // Counting it would empty the card while nobody had actually replied.
  it('does not count the reporter replying to themselves', () => {
    const own = message({ senderId: 'user-1', senderRole: 'FLEET_ADMIN' });
    expect(awaitingFirstResponse(ticket({ createdAt: hoursAgo(3) }), [own], NOW)).toBe(true);
  });

  it('only applies to open tickets', () => {
    expect(
      awaitingFirstResponse(ticket({ status: 'in_progress', createdAt: hoursAgo(5) }), [], NOW),
    ).toBe(false);
  });
});

describe('Average resolution time', () => {
  it('averages over tickets that actually resolved', () => {
    const hours = averageResolutionHours([
      ticket({ createdAt: hoursAgo(50), resolvedAt: hoursAgo(26) }),
      ticket({ createdAt: hoursAgo(20), resolvedAt: hoursAgo(8) }),
      ticket({ createdAt: hoursAgo(5) }),
    ]);
    expect(hours).toBe(18);
  });

  // An average over nothing is not a number worth showing, and zero would
  // read as instant resolution.
  it('is null when nothing has resolved', () => {
    expect(averageResolutionHours([ticket()])).toBeNull();
    expect(averageResolutionHours([])).toBeNull();
  });
});

describe('Resolved in the last seven days', () => {
  it('counts only what resolved inside the window', () => {
    const tickets = [
      ticket({ resolvedAt: hoursAgo(20) }),
      ticket({ resolvedAt: hoursAgo(100) }),
      ticket({ resolvedAt: hoursAgo(200) }),
      ticket(),
    ];
    expect(resolvedWithinDays(tickets, 7, NOW)).toBe(2);
  });
});

describe('The dashboard cards together', () => {
  it('reports every counter from one pass over the tickets', () => {
    const tickets = [
      ticket({ id: 'a', status: 'open', priority: 'high', createdAt: hoursAgo(30) }),
      ticket({ id: 'b', status: 'in_progress', priority: 'critical', createdAt: hoursAgo(4) }),
      ticket({ id: 'c', status: 'escalated', priority: 'low', createdAt: hoursAgo(2) }),
      ticket({ id: 'd', status: 'waiting_on_tenant', priority: 'medium', createdAt: hoursAgo(3) }),
      ticket({ id: 'e', status: 'resolved', createdAt: hoursAgo(30), resolvedAt: hoursAgo(20) }),
    ];

    const metrics = buildDashboardMetrics({
      tickets,
      messagesByTicketId: new Map([['a', [message({ ticketId: 'a' })]]]),
      now: NOW,
    });

    expect(metrics).toEqual({
      // open + in_progress + escalated
      activeWorkload: 3,
      // unresolved, critical or high
      criticalHigh: 2,
      // unresolved and older than 24h
      slaBreaching: 1,
      // 'a' is old enough but has been replied to; nothing else qualifies
      firstResponseBacklog: 0,
      awaitingTenant: 1,
      avgResolutionHours: 10,
      resolvedLast7Days: 1,
    });
  });
});
