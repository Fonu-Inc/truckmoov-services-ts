import { beforeEach, describe, expect, it, vi } from "vitest";
import { InMemoryOnboardingApplicationRepository } from "@auth/onboarding/infrastructure/persistence/in-memory-onboarding-application.repository";
import { ResumeOnboardingApplicationUseCase } from "@auth/onboarding/application/use-cases/resume-onboarding-application.use-case";
import { RequestOnboardingApplicationChangesUseCase } from "@auth/onboarding/application/use-cases/decide-onboarding-application.use-cases";
import {
  ChangesLinkNotResendableError,
  ChangesLinkResentTooSoonError,
  ResendChangesRequestedLinkUseCase,
} from "@auth/onboarding/application/use-cases/resend-changes-requested-link.use-case";
import { hashApplicationToken } from "@auth/onboarding/domain/onboarding-application.support";
import type { StoredOnboardingApplication } from "@auth/onboarding/domain/onboarding-application.repository";

const tokenService = { resolveAccessToken: () => ({ id: "staff-1" }) as never };
const users = {
  findById: async () => ({
    id: "staff-1",
    email: "admin@system",
    passwordHash: "x",
    role: "SYSTEM_ADMIN",
    tenantId: "system",
    accountStatus: "enabled",
  }),
};

function application(over: Partial<StoredOnboardingApplication> = {}): StoredOnboardingApplication {
  const now = new Date();
  return {
    id: "app-1",
    reference: "APP-2026-AAAA",
    tokenHash: "old-hash",
    applicantType: "enterprise",
    organizationName: "Arne logistics Ltd",
    businessEmail: "jane@arne.com",
    organizationPhone: "+2348000000000",
    contactFullName: "Jane Doe",
    contactRole: null,
    streetAddress: "Mazi Fedelis Street",
    city: "Abuja",
    state: "FCT",
    rcNumber: null,
    taxIdentificationNumber: null,
    identificationType: null,
    identificationNumber: null,
    m2mPlanCode: "m2m_standard",
    billingEmail: null,
    billingEmailVerifiedAt: null,
    emailVerifiedAt: now,
    phoneVerifiedAt: now,
    status: "draft",
    stage: null,
    submittedAt: null,
    reviewedBy: null,
    reviewedAt: null,
    decisionReason: null,
    tenantId: null,
    setupLinkStatus: null,
    setupLinkSentAt: null,
    setupLinkError: null,
    setupLinkAttempts: 0,
    createdAt: now,
    updatedAt: now,
    ...over,
  } as StoredOnboardingApplication;
}

describe("applicant link emails send before they commit the new token", () => {
  let applications: InMemoryOnboardingApplicationRepository;
  let sendResumeLink: ReturnType<typeof vi.fn>;
  let sendChangesRequested: ReturnType<typeof vi.fn>;

  const delivered = async () => ({ delivered: true as const });
  const undelivered = async () => ({ delivered: false as const, error: "smtp down" });
  const hashOf = async () => (await applications.findById("app-1"))!.tokenHash;

  beforeEach(() => {
    applications = new InMemoryOnboardingApplicationRepository();
    sendResumeLink = vi.fn(delivered);
    sendChangesRequested = vi.fn(delivered);
  });

  describe("resume", () => {
    const resume = () =>
      new ResumeOnboardingApplicationUseCase(applications, { sendResumeLink } as never);

    beforeEach(async () => {
      await applications.save(application());
    });

    it("commits the token that was mailed", async () => {
      await resume().execute("jane@arne.com");

      const sent = sendResumeLink.mock.calls[0]![0];
      expect(await hashOf()).toBe(hashApplicationToken(sent.applicationToken));
    });

    it("answers the generic reply and keeps the old token when the mail fails", async () => {
      sendResumeLink.mockImplementation(undelivered);

      await expect(resume().execute("jane@arne.com")).resolves.toMatchObject({ status: true, data: null });
      expect(await hashOf()).toBe("old-hash");
    });

    it("treats a throwing transport as a failed delivery", async () => {
      sendResumeLink.mockRejectedValue(new Error("boom"));

      await expect(resume().execute("jane@arne.com")).resolves.toMatchObject({ status: true, data: null });
      expect(await hashOf()).toBe("old-hash");
    });

    it("answers the same and sends nothing when no application matches", async () => {
      const res = await resume().execute("nobody@arne.com");

      expect(res.status).toBe(true);
      expect(sendResumeLink).not.toHaveBeenCalled();
    });
  });

  describe("request changes", () => {
    const request = () =>
      new RequestOnboardingApplicationChangesUseCase(
        applications,
        tokenService as never,
        users as never,
        { sendChangesRequested } as never,
      );
    const input = { accessToken: "t", applicationId: "app-1", reason: "Licence unreadable" };

    beforeEach(async () => {
      await applications.save(application({ status: "under_review" }));
    });

    it("moves the status and commits the mailed token", async () => {
      const res = await request().execute(input);

      expect(res.data.delivered).toBe(true);
      const stored = (await applications.findById("app-1"))!;
      expect(stored.status).toBe("changes_requested");
      const sent = sendChangesRequested.mock.calls[0]![0];
      expect(stored.tokenHash).toBe(hashApplicationToken(sent.applicationToken));
    });

    it("keeps the status change and the old token, and tells staff to resend, when the mail fails", async () => {
      sendChangesRequested.mockImplementation(undelivered);

      const res = await request().execute(input);

      expect(res.data.delivered).toBe(false);
      expect(res.message).toBe("Status updated but the email could not be sent: use Resend");
      const stored = (await applications.findById("app-1"))!;
      expect(stored.status).toBe("changes_requested");
      expect(stored.tokenHash).toBe("old-hash");
    });
  });

  describe("staff resend of the changes-requested link", () => {
    const resend = () =>
      new ResendChangesRequestedLinkUseCase(
        applications,
        { sendChangesRequested } as never,
        tokenService as never,
        users as never,
      );
    const input = { accessToken: "t", applicationId: "app-1" };

    beforeEach(async () => {
      await applications.save(
        application({ status: "changes_requested", decisionReason: "Business details: fix the address" }),
      );
    });

    it("mails the stored reason and commits the new token", async () => {
      const res = await resend().execute(input);

      expect(res.data).toMatchObject({ delivered: true, resentBy: "staff-1" });
      const sent = sendChangesRequested.mock.calls[0]![0];
      expect(sent.reason).toBe("Business details: fix the address");
      expect(await hashOf()).toBe(hashApplicationToken(sent.applicationToken));
    });

    it("reports a failed send and keeps the old token", async () => {
      sendChangesRequested.mockImplementation(undelivered);

      const res = await resend().execute(input);

      expect(res.data.delivered).toBe(false);
      expect(await hashOf()).toBe("old-hash");
    });

    it("allows one send per two minutes", async () => {
      await resend().execute(input);

      await expect(resend().execute(input)).rejects.toBeInstanceOf(ChangesLinkResentTooSoonError);
      expect(sendChangesRequested).toHaveBeenCalledTimes(1);
    });

    it("refuses an application that is not waiting on the applicant", async () => {
      await applications.save(application({ status: "under_review" }));

      await expect(resend().execute(input)).rejects.toBeInstanceOf(ChangesLinkNotResendableError);
    });
  });
});
