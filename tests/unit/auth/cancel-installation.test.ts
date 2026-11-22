import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  CancelInstallationUseCase,
  InMemoryInstallationOrderRepository,
  InstallationNotCancellableError,
  NoInstallationOrderError,
} from "@auth/installation";
import { ForbiddenError } from "@auth/session";
import type { StoredInstallationOrder } from "@auth/installation/domain/installation-order.repository";

const TENANT_ID = "tenant-1";
const NOW = new Date("2026-09-22T10:00:00Z");

function order(status: StoredInstallationOrder["status"]): StoredInstallationOrder {
  return {
    id: "order-1",
    orderNumber: "FL-1000",
    applicationId: "app-1",
    tenantId: TENANT_ID,
    scheduledDate: NOW,
    timeSlot: "morning",
    addressLine: "12 Mazi Fedelis Street",
    city: "Abuja",
    state: "FCT",
    siteContactName: "Jane Doe",
    siteContactPhone: "+2348000000000",
    notes: null,
    installerNotes: null,
    installerId: "installer-1",
    status,
    preExceptionStatus: null,
    assignedAt: NOW,
    acceptedAt: NOW,
    startedAt: null,
    issueReportedAt: null,
    completedAt: null,
    cancelledAt: status === "cancelled" ? NOW : null,
    reminderSentAt: null,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

describe("Cancelling an installation", () => {
  let orders: InMemoryInstallationOrderRepository;
  let activity: { record: ReturnType<typeof vi.fn> };
  let notifier: { notify: ReturnType<typeof vi.fn> };
  let role: string;

  function useCase() {
    return new CancelInstallationUseCase(
      orders,
      { resolveAccessToken: () => ({ id: "user-1", tenantId: TENANT_ID }) } as never,
      {
        findById: async () => ({ id: "user-1", email: "jane@arne.com", passwordHash: "", role, tenantId: TENANT_ID }),
      } as never,
      activity as never,
      notifier as never,
    );
  }

  beforeEach(() => {
    orders = new InMemoryInstallationOrderRepository();
    activity = { record: vi.fn(async () => ({})) };
    notifier = { notify: vi.fn(async () => undefined) };
    role = "OWNER_OPERATOR";
  });

  it("cancels a scheduled job, audits it and tells the installer", async () => {
    await orders.save(order("scheduled"));
    const result = await useCase().execute("token", "Changed our minds", NOW);

    expect(result.data.status).toBe("cancelled");
    expect((await orders.findById("order-1"))?.status).toBe("cancelled");
    expect(activity.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "installation.cancelled", metadata: { reason: "Changed our minds", previousStatus: "scheduled" } }),
    );
    expect(notifier.notify).toHaveBeenCalledWith(expect.objectContaining({ type: "job_cancelled" }), NOW);
  });

  it("answers the same for an order already cancelled", async () => {
    await orders.save(order("cancelled"));
    const result = await useCase().execute("token", undefined, NOW);

    expect(result.data.status).toBe("cancelled");
    expect(activity.record).not.toHaveBeenCalled();
  });

  it.each(["in_progress", "completed"] as const)("refuses once the job is %s", async (status) => {
    await orders.save(order(status));
    await expect(useCase().execute("token", undefined, NOW)).rejects.toBeInstanceOf(InstallationNotCancellableError);
  });

  it("refuses a role that does not own the onboarding", async () => {
    role = "DRIVER";
    await orders.save(order("scheduled"));
    await expect(useCase().execute("token", undefined, NOW)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("says nothing is booked when there is no order", async () => {
    await expect(useCase().execute("token", undefined, NOW)).rejects.toBeInstanceOf(NoInstallationOrderError);
  });
});
