import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  FeedbackAlreadySubmittedError,
  InMemoryInstallationOrderRepository,
  InstallationNotCompletedError,
  NoInstallationOrderError,
  SubmitInstallationFeedbackUseCase,
} from "@auth/installation";
import { ForbiddenError } from "@auth/session";
import { notificationCopy } from "@auth/installation/domain/installer-notification";
import { OnboardingValidationError } from "@auth/onboarding/domain/onboarding-application.validation";
import type { StoredInstallationOrder } from "@auth/installation/domain/installation-order.repository";

const TENANT_ID = "tenant-1";
const NOW = new Date("2026-11-23T10:00:00Z");

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
    startedAt: NOW,
    issueReportedAt: null,
    completedAt: status === "completed" ? NOW : null,
    cancelledAt: null,
    reminderSentAt: null,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

describe("Rating an installation", () => {
  let orders: InMemoryInstallationOrderRepository;
  let activity: { record: ReturnType<typeof vi.fn> };
  let notifier: { notify: ReturnType<typeof vi.fn> };
  let role: string;

  function useCase() {
    return new SubmitInstallationFeedbackUseCase(
      orders,
      { findById: async () => ({ organizationName: "Arne Logistics" }) } as never,
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

  it("saves the rating on a completed job, audits it and tells the installer", async () => {
    await orders.save(order("completed"));
    const result = await useCase().execute("token", { rating: 4, comment: " Quick and tidy " }, NOW);

    expect(result.data).toEqual({ rating: 4, comment: "Quick and tidy", submittedAt: NOW.toISOString() });
    expect(await orders.findFeedback("order-1")).toMatchObject({ rating: 4, submittedBy: "user-1" });
    expect(activity.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "installation.feedback_submitted", metadata: { rating: 4, comment: "Quick and tidy" } }),
    );
    expect(notifier.notify).toHaveBeenCalledWith(
      expect.objectContaining({ type: "job_closed", rating: 4, customer: "Arne Logistics" }),
      NOW,
    );
  });

  it.each(["scheduled", "in_progress", "cancelled"] as const)("refuses while the job is %s", async (status) => {
    await orders.save(order(status));
    await expect(useCase().execute("token", { rating: 5 }, NOW)).rejects.toBeInstanceOf(InstallationNotCompletedError);
    expect(notifier.notify).not.toHaveBeenCalled();
  });

  it("accepts feedback only once", async () => {
    await orders.save(order("completed"));
    await useCase().execute("token", { rating: 5 }, NOW);
    await expect(useCase().execute("token", { rating: 1 }, NOW)).rejects.toBeInstanceOf(FeedbackAlreadySubmittedError);
    expect((await orders.findFeedback("order-1"))?.rating).toBe(5);
    expect(notifier.notify).toHaveBeenCalledTimes(1);
  });

  it.each([0, 6, 3.5, "4", undefined])("refuses a rating of %s", async (rating) => {
    await orders.save(order("completed"));
    await expect(useCase().execute("token", { rating }, NOW)).rejects.toBeInstanceOf(OnboardingValidationError);
  });

  it("refuses a comment over 1000 characters", async () => {
    await orders.save(order("completed"));
    await expect(useCase().execute("token", { rating: 3, comment: "x".repeat(1001) }, NOW)).rejects.toBeInstanceOf(
      OnboardingValidationError,
    );
  });

  it("refuses a role that does not own the onboarding", async () => {
    role = "DRIVER";
    await orders.save(order("completed"));
    await expect(useCase().execute("token", { rating: 5 }, NOW)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("says nothing is booked when there is no order", async () => {
    await expect(useCase().execute("token", { rating: 5 }, NOW)).rejects.toBeInstanceOf(NoInstallationOrderError);
  });

  it("words the installer notice with the customer and rating", () => {
    const copy = notificationCopy("job_closed", {
      jobNumber: "FL-1000",
      scheduledDate: NOW,
      timeSlot: "morning",
      customer: "Arne Logistics",
      rating: 4,
    });
    expect(copy.body).toBe("Arne Logistics rated the installation 4/5.");
  });
});
