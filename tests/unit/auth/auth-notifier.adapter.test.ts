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
        tenantAppUrl: "https://app.truckmoov.com",
        adminAppUrl: "https://admin.truckmoov.com",
        inviteAcceptPath: "/auth/invite",
        emailVerificationPath: "/auth/verify-email",
      },
    } as AppConfigService;
    const notifier = new MailerAuthNotifier(
      mailer as unknown as MailerService,
      config,
    );

    await notifier.sendTenantInviteEmail({
      email: "invitee@truckmoov.com",
      role: "DISPATCHER",
      inviteToken: "invite-token-123",
    });

    expect(mailer.sent).toHaveLength(1);
    expect(mailer.sent[0]?.to).toBe("invitee@truckmoov.com");
    expect(mailer.sent[0]?.subject).toBe(INVITE_USER_SUBJECT);

    const inviteLink = new URL(mailer.sent[0]!.variables.inviteLink);
    expect(inviteLink.origin + inviteLink.pathname).toBe(
      "https://app.truckmoov.com/auth/invite",
    );
    expect(inviteLink.searchParams.get("invite")).toBe("invite-token-123");
    expect(inviteLink.searchParams.get("email")).toBe("invitee@truckmoov.com");
  });

  // The two audiences must never resolve to the same app: a tenant setup link
  // on the admin host, or an admin invite on the tenant host, is the bug this
  // split exists to prevent.
  it("sends a platform admin invite to the admin app", async () => {
    const mailer = new FakeMailerService();
    const config = {
      app: {
        frontendUrl: "https://dev.truckmoov.com",
        tenantAppUrl: "https://app.truckmoov.com",
        adminAppUrl: "https://admin.truckmoov.com",
        inviteAcceptPath: "/auth/invite",
        emailVerificationPath: "/auth/verify-email",
      },
    } as AppConfigService;
    const notifier = new MailerAuthNotifier(
      mailer as unknown as MailerService,
      config,
    );

    await notifier.sendPlatformInviteEmail({
      email: "admin@truckmoov.com",
      role: "SYSTEM_ADMIN",
      inviteToken: "platform-token-456",
    });

    const inviteLink = new URL(mailer.sent[0]!.variables.inviteLink);
    expect(inviteLink.origin + inviteLink.pathname).toBe(
      "https://admin.truckmoov.com/auth/invite",
    );
    expect(inviteLink.searchParams.get("invite")).toBe("platform-token-456");
  });
});
