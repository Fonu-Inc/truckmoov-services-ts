import { describe, expect, it } from "vitest";
import { InMemorySupportTicketRepository } from "../../../apps/auth/src/in-memory-support-ticket.repository";
import { InMemorySupportMessageRepository } from "../../../apps/auth/src/in-memory-support-message.repository";
import { InMemorySupportTicketAttachmentRepository } from "../../../apps/auth/src/in-memory-support-ticket-attachment.repository";
import { CreateSupportTicketUseCase, InvalidTicketFieldError } from "../../../apps/auth/src/create-support-ticket.use-case";
import { ListMySupportTicketsUseCase } from "../../../apps/auth/src/list-my-support-tickets.use-case";
import { GetMySupportTicketUseCase } from "../../../apps/auth/src/get-my-support-ticket.use-case";
import {
  CloseMySupportTicketUseCase,
  ReopenMySupportTicketUseCase,
  ReplyToMySupportTicketUseCase,
  TicketActionNotAllowedError,
} from "../../../apps/auth/src/support-ticket-lifecycle.use-cases";
import { AddMyTicketAttachmentUseCase } from "../../../apps/auth/src/add-my-ticket-attachment.use-case";
import { TicketAttachmentUploaderService } from "../../../apps/auth/src/ticket-attachment-uploader.service";
import {
  TicketAttachmentTooLargeError,
  TicketAttachmentTypeNotAllowedError,
  TicketAttachmentRejectedByScannerError,
  MAX_TICKET_ATTACHMENT_BYTES,
} from "../../../apps/auth/src/support-ticket-attachment.errors";
import { SendSystemSupportMessageUseCase } from "../../../apps/auth/src/send-system-support-message.use-case";
import { UpdateSystemSupportTicketStatusUseCase } from "../../../apps/auth/src/update-system-support-ticket-status.use-case";
import type { ForbiddenError } from "../../../apps/auth/src/contexts/auth/session";

const TENANT = "tenant-a";
const OTHER_TENANT = "tenant-b";

function fakeAuth(tenantId: string, role = "FLEET_ADMIN") {
  const user = { id: "user-1", email: "ops@tenant-a.com", role, tenantId, accountStatus: "active" };
  return {
    tokenService: { resolveAccessToken: () => ({ id: "user-1" }) } as never,
    userRepository: { findById: async () => user } as never,
  };
}

let ticketIdCounter = 0;

function harness(tenantId = TENANT) {
  const { tokenService, userRepository } = fakeAuth(tenantId);
  const tickets = new InMemorySupportTicketRepository();
  const messages = new InMemorySupportMessageRepository();
  const attachments = new InMemorySupportTicketAttachmentRepository();
  const idGenerator = { generate: () => `ticket-${++ticketIdCounter}` } as never;

  return {
    tickets,
    messages,
    attachments,
    create: new CreateSupportTicketUseCase(tokenService, userRepository, idGenerator, tickets),
    list: new ListMySupportTicketsUseCase(tokenService, userRepository, tickets),
    get: new GetMySupportTicketUseCase(tokenService, userRepository, tickets, messages, attachments),
    reply: new ReplyToMySupportTicketUseCase(tokenService, userRepository, tickets, messages),
    close: new CloseMySupportTicketUseCase(tokenService, userRepository, tickets),
    reopen: new ReopenMySupportTicketUseCase(tokenService, userRepository, tickets, messages),
  };
}

async function raise(kit: ReturnType<typeof harness>, overrides: Record<string, unknown> = {}) {
  const result = await kit.create.execute({
    accessToken: "token",
    subject: "GPS tracker offline on TRK-204",
    description: "Tracker has not reported since this morning",
    category: "device_tracking",
    ...overrides,
  });
  return result.ticket;
}

describe("Raising a ticket", () => {
  it("creates it as open, owned by the caller's tenant", async () => {
    const kit = harness();
    const ticket = await raise(kit);

    expect(ticket.status).toBe("open");
    expect(ticket.tenantId).toBe(TENANT);
    expect(ticket.createdBy).toBe("user-1");
  });

  it("defaults priority to medium rather than forcing a choice", async () => {
    const ticket = await raise(harness());
    expect(ticket.priority).toBe("medium");
  });

  it("refuses an unknown category", async () => {
    await expect(() => raise(harness(), { category: "not-a-real-category" })).rejects.toBeInstanceOf(
      InvalidTicketFieldError,
    );
  });

  it("requires a context id once a context type is given", async () => {
    // "GPS tracker offline" is not actionable without knowing which tracker.
    await expect(() => raise(harness(), { contextType: "device" })).rejects.toThrow("contextId is required");
  });

  it("accepts a context type with its id", async () => {
    const ticket = await raise(harness(), { contextType: "device", contextId: "dev-99" });
    expect(ticket.contextType).toBe("device");
    expect(ticket.contextId).toBe("dev-99");
  });

  it("refuses a blank subject", async () => {
    await expect(() => raise(harness(), { subject: "   " })).rejects.toBeInstanceOf(InvalidTicketFieldError);
  });
});

describe("Tenant isolation", () => {
  it("does not list another tenant's tickets", async () => {
    const owner = harness(TENANT);
    await raise(owner);

    const stranger = harness(OTHER_TENANT);
    stranger.tickets === owner.tickets; // same store, different actor tenant
    const result = await stranger.list.execute("token");
    expect(result.data.tickets).toHaveLength(0);
  });

  it("returns not-found rather than another tenant's ticket", async () => {
    const owner = harness(TENANT);
    const ticket = await raise(owner);

    const stranger = harness(OTHER_TENANT);
    await expect(stranger.get.execute("token", ticket.id)).rejects.toMatchObject({ status: 404 });
  });

  it("counts by status only over the caller's own tickets", async () => {
    const kit = harness(TENANT);
    await raise(kit);
    await raise(kit);

    const result = await kit.list.execute("token");
    expect(result.data.countsByStatus.open).toBe(2);
    expect(result.data.total).toBe(2);
  });
});

describe("Reading a ticket", () => {
  it("filters out internal staff-only messages", async () => {
    const kit = harness(TENANT);
    const ticket = await raise(kit);
    await kit.messages.save({
      id: "m1", ticketId: ticket.id, senderId: "staff-1", senderName: "Staff",
      senderRole: "SYSTEM_ADMIN", message: "internal note to self", isInternal: true, createdAt: new Date(),
    });
    await kit.messages.save({
      id: "m2", ticketId: ticket.id, senderId: "staff-1", senderName: "Staff",
      senderRole: "SYSTEM_ADMIN", message: "we are looking into it", isInternal: false, createdAt: new Date(),
    });

    const result = await kit.get.execute("token", ticket.id);
    expect(result.data.messages).toHaveLength(1);
    expect(result.data.messages[0]?.message).toBe("we are looking into it");
  });
});

describe("Replying to a ticket", () => {
  it("clears waiting_on_tenant back to in_progress", async () => {
    const kit = harness();
    const ticket = await raise(kit);
    ticket.status = "waiting_on_tenant";
    await kit.tickets.save(ticket);

    const result = await kit.reply.execute({ accessToken: "token", ticketId: ticket.id, message: "here is more detail" });

    // The ball is back with support, without staff having to notice and flip it.
    expect(result.ticketStatus).toBe("in_progress");
  });

  it("leaves a status other than waiting_on_tenant alone", async () => {
    const kit = harness();
    const ticket = await raise(kit); // open

    const result = await kit.reply.execute({ accessToken: "token", ticketId: ticket.id, message: "update" });
    expect(result.ticketStatus).toBe("open");
  });

  it("refuses a reply to a closed ticket", async () => {
    const kit = harness();
    const ticket = await raise(kit);
    ticket.status = "closed";
    await kit.tickets.save(ticket);

    await expect(() =>
      kit.reply.execute({ accessToken: "token", ticketId: ticket.id, message: "hello?" }),
    ).rejects.toBeInstanceOf(TicketActionNotAllowedError);
  });

  it("refuses an empty message", async () => {
    const kit = harness();
    const ticket = await raise(kit);
    await expect(() =>
      kit.reply.execute({ accessToken: "token", ticketId: ticket.id, message: "   " }),
    ).rejects.toBeInstanceOf(TicketActionNotAllowedError);
  });
});

describe("Closing and reopening", () => {
  it("only lets a resolved ticket be closed", async () => {
    const kit = harness();
    const ticket = await raise(kit);
    await expect(() => kit.close.execute({ accessToken: "token", ticketId: ticket.id })).rejects.toBeInstanceOf(
      TicketActionNotAllowedError,
    );
  });

  it("closes a resolved ticket", async () => {
    const kit = harness();
    const ticket = await raise(kit);
    ticket.status = "resolved";
    await kit.tickets.save(ticket);

    const result = await kit.close.execute({ accessToken: "token", ticketId: ticket.id });
    expect(result.ticket.status).toBe("closed");
    expect(result.ticket.closedAt).not.toBeNull();
  });

  it("requires a reason to reopen", async () => {
    const kit = harness();
    const ticket = await raise(kit);
    ticket.status = "resolved";
    await kit.tickets.save(ticket);

    await expect(() =>
      kit.reopen.execute({ accessToken: "token", ticketId: ticket.id, reason: "" }),
    ).rejects.toBeInstanceOf(TicketActionNotAllowedError);
  });

  it("reopens to open, with the reason on the thread", async () => {
    const kit = harness();
    const ticket = await raise(kit);
    ticket.status = "resolved";
    ticket.resolvedAt = new Date();
    await kit.tickets.save(ticket);

    const result = await kit.reopen.execute({
      accessToken: "token", ticketId: ticket.id, reason: "tracker went dark again",
    });
    expect(result.ticket.status).toBe("open");
    expect(result.ticket.resolvedAt).toBeNull();

    const messages = await kit.messages.findByTicketId(ticket.id);
    expect(messages[0]?.message).toContain("tracker went dark again");
  });

  it("refuses to reopen a ticket that is not resolved", async () => {
    const kit = harness();
    const ticket = await raise(kit); // open
    await expect(() =>
      kit.reopen.execute({ accessToken: "token", ticketId: ticket.id, reason: "still broken" }),
    ).rejects.toBeInstanceOf(TicketActionNotAllowedError);
  });
});

describe("Attachment limits", () => {
  function attachmentHarness(scannerVerdict: { scanned: boolean; clean: boolean; reason?: string }) {
    const attachments = new InMemorySupportTicketAttachmentRepository();
    const storageQuota = { assertRoomFor: async () => {}, record: async () => {} } as never;
    const scanner = { scan: async () => scannerVerdict } as never;
    const storage = { putObject: async () => {} } as never;
    const uploader = new TicketAttachmentUploaderService(
      storage, storageQuota, scanner, attachments, { generate: () => "att-1" } as never,
    );
    return { attachments, uploader };
  }

  it("refuses a file over the cap", async () => {
    const { uploader } = attachmentHarness({ scanned: true, clean: true });
    await expect(() =>
      uploader.upload({
        tenantId: TENANT, ticketId: "t1", messageId: null, uploadedBy: "u1",
        files: [{ filename: "big.pdf", contentType: "application/pdf", buffer: Buffer.alloc(MAX_TICKET_ATTACHMENT_BYTES + 1) }],
      }),
    ).rejects.toBeInstanceOf(TicketAttachmentTooLargeError);
  });

  it("refuses a type that is not on the accepted list", async () => {
    const { uploader } = attachmentHarness({ scanned: true, clean: true });
    await expect(() =>
      uploader.upload({
        tenantId: TENANT, ticketId: "t1", messageId: null, uploadedBy: "u1",
        files: [{ filename: "script.exe", contentType: "application/x-msdownload", buffer: Buffer.from("x") }],
      }),
    ).rejects.toBeInstanceOf(TicketAttachmentTypeNotAllowedError);
  });

  it("refuses a file the scanner flags", async () => {
    const { uploader } = attachmentHarness({ scanned: true, clean: false, reason: "signature match: eicar" });
    await expect(() =>
      uploader.upload({
        tenantId: TENANT, ticketId: "t1", messageId: null, uploadedBy: "u1",
        files: [{ filename: "doc.pdf", contentType: "application/pdf", buffer: Buffer.from("x") }],
      }),
    ).rejects.toBeInstanceOf(TicketAttachmentRejectedByScannerError);
  });

  it("stores an accepted file and records it against the ticket", async () => {
    const { uploader, attachments } = attachmentHarness({ scanned: true, clean: true });
    const saved = await uploader.upload({
      tenantId: TENANT, ticketId: "t1", messageId: null, uploadedBy: "u1",
      files: [{ filename: "photo.jpg", contentType: "image/jpeg", buffer: Buffer.from("x") }],
    });

    expect(saved).toHaveLength(1);
    expect((await attachments.findByTicketId("t1"))[0]?.filename).toBe("photo.jpg");
  });
});

describe("Ownership check on attaching a file", () => {
  it("refuses to attach to a ticket that belongs to another tenant", async () => {
    const owner = harness(TENANT);
    const ticket = await raise(owner);

    const { tokenService, userRepository } = fakeAuth(OTHER_TENANT);
    const uploader = {
      upload: async () => {
        throw new Error("must not be called");
      },
    } as never;
    const useCase = new AddMyTicketAttachmentUseCase(
      tokenService, userRepository, owner.tickets, owner.messages, uploader,
    );

    await expect(
      useCase.execute({ accessToken: "token", ticketId: ticket.id, files: [] }),
    ).rejects.toMatchObject({ status: 404 });
  });
});

describe("Notifying the tenant of platform-side changes", () => {
  function adminFakeAuth() {
    const staff = { id: "staff-1", email: "staff@truckmoov.com", role: "SYSTEM_ADMIN", tenantId: "system", accountStatus: "active" };
    return {
      tokenService: { resolveAccessToken: () => ({ id: "staff-1", tenantId: "system", role: "SYSTEM_ADMIN" }) } as never,
      userRepository: { findById: async () => staff } as never,
    };
  }

  it("notifies the tenant when support sends a non-internal reply", async () => {
    const kit = harness(TENANT);
    const ticket = await raise(kit);
    const { tokenService, userRepository } = adminFakeAuth();
    const notified: Array<{ tenantId: string; ticketId: string }> = [];
    const notifier = {
      notifyReplied: async (tenantId: string, ticketId: string) => {
        notified.push({ tenantId, ticketId });
      },
    } as never;

    const useCase = new SendSystemSupportMessageUseCase(tokenService, userRepository, kit.tickets, kit.messages, notifier);
    await useCase.execute("token", ticket.id, "we are on it", false);

    expect(notified).toEqual([{ tenantId: TENANT, ticketId: ticket.id }]);
  });

  it("does not notify the tenant of an internal note", async () => {
    const kit = harness(TENANT);
    const ticket = await raise(kit);
    const { tokenService, userRepository } = adminFakeAuth();
    const notified: unknown[] = [];
    const notifier = { notifyReplied: async () => notified.push(1) } as never;

    const useCase = new SendSystemSupportMessageUseCase(tokenService, userRepository, kit.tickets, kit.messages, notifier);
    // An internal note must not leak that a note exists, or its content, to the tenant.
    await useCase.execute("token", ticket.id, "checking with the SIM vendor", true);

    expect(notified).toHaveLength(0);
  });

  it("notifies the tenant on a status change", async () => {
    const kit = harness(TENANT);
    const ticket = await raise(kit);
    const { tokenService, userRepository } = adminFakeAuth();
    const notified: Array<{ tenantId: string; ticketId: string; status: string }> = [];
    const notifier = {
      notifyStatusChanged: async (tenantId: string, ticketId: string, status: string) => {
        notified.push({ tenantId, ticketId, status });
      },
    } as never;

    const useCase = new UpdateSystemSupportTicketStatusUseCase(tokenService, userRepository, kit.tickets, notifier);
    await useCase.execute("token", ticket.id, "resolved");

    expect(notified).toEqual([{ tenantId: TENANT, ticketId: ticket.id, status: "resolved" }]);
  });
});
