import { describe, expect, it, vi } from "vitest";
import { MailerOnboardingDecisionNotifier } from "@auth/onboarding/infrastructure/notifications/mailer-onboarding-decision.notifier";

const email = {
  email: "jane@arne.com",
  organizationName: "Arne",
  reference: "APP-1",
  applicationId: "app-1",
  applicationToken: "tok-new",
};

function build() {
  const send = vi.fn(async () => undefined);
  const config = { app: { tenantAppUrl: "https://app.truckmoov.test" } };
  return { notifier: new MailerOnboardingDecisionNotifier({ send } as never, config as never), send };
}

describe("applicant mail links", () => {
  it.each([
    ["sendResumeLink"],
    ["sendPaymentOpen"],
    ["sendPaymentRefunded"],
  ] as const)("%s links to the apply page with the token and application id", async (method) => {
    const { notifier, send } = build();

    await notifier[method](email);

    const link = new URL((send.mock.calls[0] as unknown as [{ variables: { resumeLink: string } }])[0].variables.resumeLink);
    expect(link.origin + link.pathname).toBe("https://app.truckmoov.test/apply");
    expect(link.searchParams.get("token")).toBe("tok-new");
    expect(link.searchParams.get("applicationId")).toBe("app-1");
  });

  it("links the changes-requested mail the same way", async () => {
    const { notifier, send } = build();

    await notifier.sendChangesRequested({ ...email, reason: "Licence unreadable" } as never);

    const link = new URL((send.mock.calls[0] as unknown as [{ variables: { resumeLink: string } }])[0].variables.resumeLink);
    expect(link.pathname).toBe("/apply");
    expect(link.searchParams.get("token")).toBe("tok-new");
  });
});
