import "reflect-metadata";
import { describe, expect, it } from "vitest";
import { InMemorySupportTicketRepository } from "../../../apps/auth/src/in-memory-support-ticket.repository";
import { InMemorySupportTicketCsatRepository } from "../../../apps/auth/src/in-memory-support-ticket-csat.repository";
import { MyTicketCsatUseCases } from "../../../apps/auth/src/my-support-ticket-csat.use-cases";
import { TicketCsatAlreadySubmittedError } from "../../../apps/auth/src/support-ticket-csat.repository";
import { TicketActionNotAllowedError } from "../../../apps/auth/src/support-ticket-lifecycle.use-cases";
import { withReporterNames } from "../../../apps/auth/src/list-my-support-tickets.use-case";
import { SupportTicketNotifierService } from "../../../apps/auth/src/support-ticket-notifier.service";
import {
  matchesTenantSearch,
  TENANT_USER_REPORTER,
  type StoredSupportTicket,
} from "../../../apps/auth/src/support-ticket.repository";

const TENANT = "tenant-a";

function ticket(overrides: Partial<StoredSupportTicket> = {}): StoredSupportTicket {
  const now = new Date();
  return {
    id: "tkt-uuid-1",
    ticketNumber: 1042,
    tenantId: TENANT,
    ...TENANT_USER_REPORTER,
    category: "device_tracking",
    subject: "Tracker offline",
    description: "No fix since morning",
    status: "resolved",
    priority: "medium",
    channel: null,
    otherChannel: null,
    contextType: "none",
    contextId: null,
    contextSnapshot: null,
    escalatedTo: null,
    escalatedReferenceId: null,
    escalationNotes: null,
    escalatedAt: null,
    escalatedBy: null,
    assignedTo: null,
    createdBy: "user-1",
    resolvedAt: now,
    closedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function csatKit(tenantId = TENANT) {
  const user = { id: "user-2", email: "dispatch@tenant-a.com", role: "DISPATCHER", tenantId, accountStatus: "enabled" };
  const tickets = new InMemorySupportTicketRepository();
  const csat = new MyTicketCsatUseCases(
    { resolveAccessToken: () => ({ id: user.id }) } as never,
    { findById: async () => user } as never,
    tickets,
    new InMemorySupportTicketCsatRepository(),
  );
  return { tickets, csat };
}

describe("Ticket CSAT", () => {
  it("lets anyone on the account rate a resolved ticket once", async () => {
    const { tickets, csat } = csatKit();
    await tickets.save(ticket());

    const saved = await csat.submit({ accessToken: "t", ticketId: "tkt-uuid-1", rating: 4, comment: "  quick  ", wouldRecommend: true });

    expect(saved).toMatchObject({ rating: 4, comment: "quick", wouldRecommend: true, userId: "user-2" });
    expect(await csat.get("t", "tkt-uuid-1")).toMatchObject({ rating: 4 });
    await expect(csat.submit({ accessToken: "t", ticketId: "tkt-uuid-1", rating: 5 }))
      .rejects.toBeInstanceOf(TicketCsatAlreadySubmittedError);
  });

  it("refuses a rating before the ticket is resolved, and out-of-range ratings", async () => {
    const { tickets, csat } = csatKit();
    await tickets.save(ticket({ status: "in_progress" }));
    await expect(csat.submit({ accessToken: "t", ticketId: "tkt-uuid-1", rating: 3 }))
      .rejects.toBeInstanceOf(TicketActionNotAllowedError);

    await tickets.save(ticket({ status: "closed" }));
    await expect(csat.submit({ accessToken: "t", ticketId: "tkt-uuid-1", rating: 6 }))
      .rejects.toBeInstanceOf(TicketActionNotAllowedError);
  });

  it("answers another tenant's ticket as not found", async () => {
    const { tickets, csat } = csatKit("tenant-b");
    await tickets.save(ticket());
    await expect(csat.get("t", "tkt-uuid-1")).rejects.toThrow(/not found/);
  });
});

describe("Tenant ticket search and reporter names", () => {
  it("matches the ticket number in any form people quote it", () => {
    const t = ticket();
    expect(matchesTenantSearch(t, "#tkt-1042")).toBe(true);
    expect(matchesTenantSearch(t, "TKT-1042")).toBe(true);
    expect(matchesTenantSearch(t, "1042")).toBe(true);
    expect(matchesTenantSearch(t, "offline")).toBe(true);
    expect(matchesTenantSearch(t, "#tkt-1043")).toBe(false);
  });

  it("names each reporter by full name, else email, looking each user up once", async () => {
    const lookups: string[] = [];
    const users = {
      findById: async (id: string) => {
        lookups.push(id);
        if (id === "user-1") return { id, email: "ada@x.com", profile: { fullName: "Ada Obi" } };
        if (id === "user-2") return { id, email: "bayo@x.com", profile: { fullName: null } };
        return null;
      },
    } as never;

    const named = await withReporterNames(users, [
      ticket({ createdBy: "user-1" }),
      ticket({ createdBy: "user-1" }),
      ticket({ createdBy: "user-2" }),
      ticket({ createdBy: "gone" }),
    ]);

    expect(named.map((t) => t.reporterName)).toEqual(["Ada Obi", "Ada Obi", "bayo@x.com", null]);
    expect(lookups.sort()).toEqual(["gone", "user-1", "user-2"]);
  });
});

describe("Support ticket notifier", () => {
  function notifierKit(stored: StoredSupportTicket) {
    const published: Array<{ subject: string; data: Record<string, unknown> }> = [];
    const emails: Array<{ recipient: string; content: string }> = [];
    const notifier = new SupportTicketNotifierService(
      { publish: async (subject: string, envelope: { data: Record<string, unknown> }) => { published.push({ subject, data: envelope.data }); } } as never,
      { findById: async () => stored } as never,
      { findById: async () => ({ id: "user-1", email: "ada@x.com" }) } as never,
      { notify: async (n: { recipient: string; content: string }) => { emails.push(n); } } as never,
    );
    return { notifier, published, emails };
  }

  it("publishes agent replies with the ticket id and emails the reporter", async () => {
    const { notifier, published, emails } = notifierKit(ticket());
    await notifier.notifyReplied(TENANT, "tkt-uuid-1");

    expect(published).toEqual([
      { subject: `tm.${TENANT}.support_ticket.replied`, data: { ticket_id: "tkt-uuid-1", ticketId: "tkt-uuid-1" } },
    ]);
    expect(emails).toHaveLength(1);
    expect(emails[0].recipient).toBe("ada@x.com");
    expect(emails[0].content).toContain("#tkt-1042");
  });

  it("does not email anyone about the tenant's own reply or an installer's ticket", async () => {
    const own = notifierKit(ticket());
    await own.notifier.notifyCustomerReplied(TENANT, "tkt-uuid-1", "in_progress");
    expect(own.published[0].subject).toBe(`tm.${TENANT}.support_ticket.customer_replied`);
    expect(own.emails).toHaveLength(0);

    const installer = notifierKit(ticket({ reporterType: "installer" }));
    await installer.notifier.notifyStatusChanged("system", "tkt-uuid-1", "resolved");
    expect(installer.emails).toHaveLength(0);
  });
});
