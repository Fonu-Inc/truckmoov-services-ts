import { describe, expect, it } from "vitest";
import type { AppConfigService } from "@shared/config";
import type { MailerService } from "@shared/mailer";
import { MailerAuthNotifier } from "../../../apps/auth/src/contexts/auth/session/infrastructure/auth-notifier.adapter";
import { INVITE_USER_SUBJECT } from "../../../apps/auth/src/templates/invite-user.template";

class FakeMailerService {
  public readonly sent: Array<{
    to: string;
    subject: string;
    template: string;
    variables: Record<string, string>;
  }> = [];

  async send(input: {
    to: string;
    subject: string;
    template: string;
    variables: Record<string, string>;
  }) {
    this.sent.push(input);
  }
}

describe("MailerAuthNotifier", () => {
  it("includes invite token and invited email in the frontend invite link", async () => {
    const mailer = new FakeMailerService();
    const config = {
      app: {
        frontendUrl: "https://dev.truckmoov.com",
        inviteAcceptPath: "/auth/invite",
        emailVerificationPath: "/auth/verify-email",
      },
    } as AppConfigService;
    const notifier = new MailerAuthNotifier(
      mailer as unknown as MailerService,
      config,
    );

    await notifier.sendInviteEmail({
      email: "invitee@truckmoov.com",
      role: "DISPATCHER",
      inviteToken: "invite-token-123",
    });

    expect(mailer.sent).toHaveLength(1);
    expect(mailer.sent[0]?.to).toBe("invitee@truckmoov.com");
    expect(mailer.sent[0]?.subject).toBe(INVITE_USER_SUBJECT);

    const inviteLink = new URL(mailer.sent[0]!.variables.inviteLink);
    expect(inviteLink.origin + inviteLink.pathname).toBe(
      "https://dev.truckmoov.com/auth/invite",
    );
    expect(inviteLink.searchParams.get("invite")).toBe("invite-token-123");
    expect(inviteLink.searchParams.get("email")).toBe("invitee@truckmoov.com");
  });
});
