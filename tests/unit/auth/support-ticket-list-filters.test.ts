import "reflect-metadata";
import { describe, expect, it } from "vitest";
import { InMemorySupportTicketRepository } from "../../../apps/auth/src/in-memory-support-ticket.repository";
import { ListMySupportTicketsUseCase } from "../../../apps/auth/src/list-my-support-tickets.use-case";
import type { StoredSupportTicket } from "../../../apps/auth/src/support-ticket.repository";

const TENANT = "tenant-a";

function ticket(n: number, overrides: Partial<StoredSupportTicket> = {}): StoredSupportTicket {
  return {
    id: `t-${n}`,
    ticketNumber: 1000 + n,
    tenantId: TENANT,
    reporterType: "tenant_user",
    reporterId: null,
    relatedTenantId: null,
    relatedOrderId: null,
    issueCode: null,
    callbackPhone: null,
    category: "other",
    subject: `Ticket ${n}`,
    description: "Something broke",
    status: "open",
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
    resolvedAt: null,
    closedAt: null,
    createdAt: new Date(Date.UTC(2026, 0, n)),
    updatedAt: new Date(Date.UTC(2026, 0, n)),
    ...overrides,
  };
}

async function kit(tickets: StoredSupportTicket[]) {
  const repo = new InMemorySupportTicketRepository();
  for (const t of tickets) await repo.save(t);
  const user = { id: "user-1", email: "ops@tenant-a.com", role: "OWNER_OPERATOR", tenantId: TENANT, accountStatus: "active" };
  return new ListMySupportTicketsUseCase(
    { resolveAccessToken: () => ({ id: "user-1" }) } as never,
    { findById: async () => user } as never,
    repo,
  );
}

const ids = (result: { data: { tickets: Array<{ id: string }> } }) => result.data.tickets.map((t) => t.id);

describe("Tenant ticket list filters", () => {
  it("accepts a comma-separated status list", async () => {
    const list = await kit([
      ticket(1, { status: "open" }),
      ticket(2, { status: "in_progress" }),
      ticket(3, { status: "closed" }),
    ]);
    const result = await list.execute("token", { status: "open, in_progress" });
    expect(ids(result)).toEqual(["t-2", "t-1"]);
  });

  it("resolves createdBy=me to the caller", async () => {
    const list = await kit([ticket(1), ticket(2, { createdBy: "user-2" })]);
    const result = await list.execute("token", { createdBy: "me" });
    expect(ids(result)).toEqual(["t-1"]);
  });

  it("matches channel against otherChannel case-insensitively", async () => {
    const list = await kit([
      ticket(1, { channel: "other", otherChannel: "Live Chat" }),
      ticket(2, { channel: "device" }),
    ]);
    expect(ids(await list.execute("token", { channel: "live chat" }))).toEqual(["t-1"]);
    expect(ids(await list.execute("token", { channel: "device" }))).toEqual(["t-2"]);
  });

  it("pages newest first and reports the full total", async () => {
    const list = await kit([ticket(1), ticket(2), ticket(3)]);
    const result = await list.execute("token", {}, { page: 2, limit: 2 });
    expect(ids(result)).toEqual(["t-1"]);
    expect(result.data.total).toBe(3);
    expect(result.data.limit).toBe(2);
  });

  it("returns everything up to the cap when no page is sent", async () => {
    const list = await kit([ticket(1), ticket(2), ticket(3)]);
    const result = await list.execute("token");
    expect(result.data.tickets).toHaveLength(3);
    expect(result.data.limit).toBe(500);
  });

  it("caps the page size at 100", async () => {
    const list = await kit([ticket(1)]);
    const result = await list.execute("token", {}, { limit: 1000 });
    expect(result.data.limit).toBe(100);
  });

  it("finds the open chat with the widget's fallback query", async () => {
    const list = await kit([
      ticket(1, { otherChannel: "live chat", status: "closed" }),
      ticket(2, { otherChannel: "live chat", status: "in_progress" }),
      ticket(3, { otherChannel: "live chat", createdBy: "user-2" }),
      ticket(4, { channel: "device" }),
    ]);
    const result = await list.execute(
      "token",
      { createdBy: "me", channel: "live chat", status: "open,in_progress,waiting_on_tenant,escalated" },
      { limit: 1 },
    );
    expect(ids(result)).toEqual(["t-2"]);
  });

  it("never lists another tenant's tickets", async () => {
    const list = await kit([ticket(1, { tenantId: "tenant-b" })]);
    expect((await list.execute("token")).data.tickets).toHaveLength(0);
  });
});
