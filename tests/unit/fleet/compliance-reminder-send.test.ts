import { describe, expect, it, vi } from "vitest";
import { ComplianceReminderSendService } from "../../../apps/fleet/src/compliance-reminder-send.service";
import type { ComplianceDocumentFilters, StoredComplianceDocument } from "../../../apps/fleet/src/compliance-document.repository";

const NOW = new Date("2026-10-01T09:00:00Z");

function doc(id: string, tenantId: string, expiryDate: string | null, vehicleId = "v1"): StoredComplianceDocument {
  return {
    id, tenantId, vehicleId, documentType: "insurance", documentName: `Doc ${id}`, expiryDate,
    createdAt: NOW, updatedAt: NOW,
  } as unknown as StoredComplianceDocument;
}

// Filters the way the Postgres repository does, undated documents included.
function repository(rows: StoredComplianceDocument[]) {
  return {
    findAllByTenant: async (tenantId: string, filters: ComplianceDocumentFilters = {}) =>
      rows
        .filter((r) => r.tenantId === tenantId)
        .filter((r) => !filters.vehicleIds || filters.vehicleIds.includes(r.vehicleId ?? ""))
        .filter((r) => !filters.expiryDateTo || (r.expiryDate ?? "") <= filters.expiryDateTo),
  };
}

async function setup() {
  const documents = repository([
    doc("soon", "t1", "2026-10-20"),
    doc("expired", "t1", "2026-09-01"),
    doc("later", "t1", "2027-03-01"),
    doc("undated", "t1", null),
    doc("other-tenant", "t2", "2026-10-05"),
  ]);
  const vehicles = { findById: vi.fn(async () => ({ plateNumber: "LAG-123-AB" })) };
  const mailer = { send: vi.fn(async () => {}) };
  return { service: new ComplianceReminderSendService(documents as never, vehicles as never, mailer as never), mailer };
}

describe("Send compliance reminders", () => {
  // The button used to run the platform-wide sweep for every tenant and
  // ignore the address the user typed.
  it("mails the given address about this tenant's documents in the window", async () => {
    const { service, mailer } = await setup();

    const result = await service.send("t1", "ops@acme.ng", 30, undefined, NOW);

    expect(result).toEqual({ queued: 2, recipient: "ops@acme.ng" });
    const mail = mailer.send.mock.calls[0][0] as { to: string; variables: { rows: string } };
    expect(mail.to).toBe("ops@acme.ng");
    expect(mail.variables.rows).toContain("Doc soon");
    expect(mail.variables.rows).toContain("expired 2026-09-01");
    expect(mail.variables.rows).not.toContain("Doc later");
    expect(mail.variables.rows).not.toContain("other-tenant");
  });

  it("sends nothing when no document is due", async () => {
    const { service, mailer } = await setup();

    const result = await service.send("t1", "ops@acme.ng", 7, ["no-such-vehicle"], NOW);

    expect(result.queued).toBe(0);
    expect(mailer.send).not.toHaveBeenCalled();
  });
});
