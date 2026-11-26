import "reflect-metadata";
import { describe, expect, it } from "vitest";
import { describeItem } from "../../../apps/auth/src/enforcement-notice.service";
import { MailerEnforcementNotifier } from "../../../apps/auth/src/contexts/onboarding/infrastructure/notifications/mailer-enforcement.notifier";
import { MailerService } from "@shared/mailer";
import type { EnforcementEmail } from "../../../apps/auth/src/contexts/onboarding/domain/ports/enforcement-notifier.port";
import { buildEnforcement } from "./enforcement-harness";

const email = (over: Partial<EnforcementEmail> = {}): EnforcementEmail => ({
  to: "a@corp.test",
  kind: "final",
  customerName: "Acme <Haulage>",
  amountOwedNgn: 125_000,
  dueDate: "2026-10-01",
  graceEndsOn: "2026-10-04", graceDays: 3,
  daysLeft: 2,
  suspendOn: "2026-10-05",
  items: ["Invoice INV-1", "SIM monthly charge for September 2026"],
  ...over,
});

async function render(over: Partial<EnforcementEmail> = {}) {
  const messages: Array<{ to: string; subject: string; body: string }> = [];
  const mailer = new MailerService({ send: async (m: { to: string; subject: string; body: string }) => { messages.push(m); } });
  const config = { app: { tenantAppUrl: "https://app.truckmoov.test" } } as never;
  await new MailerEnforcementNotifier(mailer, config).send(email(over));
  return messages[0];
}

describe("notice emails", () => {
  it("fills every placeholder and escapes the customer name", async () => {
    const message = await render();
    expect(message.body).not.toMatch(/\{\{/);
    expect(message.subject).not.toMatch(/\{\{/);
    expect(message.body).toContain("Acme &#60;Haulage&#62;");
    expect(message.body).toContain("2026-10-05");
    expect(message.body).toContain("Invoice INV-1");
    expect(message.body).toContain("SIM monthly charge for September 2026");
    expect(message.body).toContain("https://app.truckmoov.test/billing");
    expect(message.subject).toBe("Last reminder: your access will be paused on 2026-10-05 unless payment is received");
  });

  it("states the days left in the overdue notice", async () => {
    const message = await render({ kind: "grace_daily", daysLeft: 2 });
    expect(message.subject).toBe("Your payment is overdue: 2 days left before access is paused");
    expect((await render({ kind: "grace_daily", daysLeft: 1 })).subject).toContain("1 day left");
    expect((await render({ kind: "grace_daily", daysLeft: 0 })).subject).toContain("less than a day left");
  });

  it("uses the agreed headline for each kind", async () => {
    expect((await render({ kind: "due_today" })).subject).toBe("A payment is due today");
    expect((await render({ kind: "suspended" })).subject).toBe("Your account is paused. Pay to restore everything automatically.");
    expect((await render({ kind: "restored" })).subject).toBe("Thank you, your account is fully restored");
  });

  it("never claims the mobile network was told and uses plain words", async () => {
    for (const kind of ["due_today", "grace_daily", "final", "suspended", "restored"] as const) {
      const { body } = await render({ kind });
      expect(body).not.toMatch(/network (was|has been) (told|notified|barred)|carrier|barred|dry-run|cascade|ingest/i);
    }
    const suspended = (await render({ kind: "suspended" })).body;
    expect(suspended).toMatch(/SIMs are marked as paused in FleetPro/);
    expect(suspended).toMatch(/users/);
    expect(suspended).toMatch(/tracking links/);
  });

  it("leaves the pay button and item list off the restored notice", async () => {
    const { body } = await render({ kind: "restored" });
    expect(body).not.toContain("Pay now");
    expect(body).not.toContain("Invoice INV-1");
  });

  it("describes an item in plain words", () => {
    expect(describeItem({ source: "invoice", reference: "INV-9", dueDate: "2026-10-01", owedKobo: 1 })).toBe("Invoice INV-9");
    expect(describeItem({ source: "sim_monthly", reference: "sim-monthly:t:2026-09", dueDate: "2026-09-01", owedKobo: 1 })).toBe(
      "SIM monthly charge for September 2026",
    );
  });
});

describe("notice delivery protocol", () => {
  it("gives up on a notice after three failed tries", async () => {
    const h = await buildEnforcement();
    await h.addTenant("a", { dueDate: "2026-10-01" });
    h.mail.failAll = true;
    const input = { tenantId: "a", kind: "final" as const, unpaidSince: "2026-10-01", graceEndsOn: "2026-10-04", graceDays: 3, owedKobo: 1, daysLeft: 1, today: "2026-10-03" };

    expect(await h.noticeService.sendScheduled(input)).toBe("failed");
    expect(await h.noticeService.sendScheduled(input)).toBe("failed");
    expect(await h.noticeService.sendScheduled(input)).toBe("failed");
    expect(await h.noticeService.sendScheduled(input)).toBe("duplicate");
    expect(h.notifier.send).toHaveBeenCalledTimes(3);
  });

  it("sends nothing and records nothing without a recipient", async () => {
    const h = await buildEnforcement();
    await h.addTenant("a", { dueDate: "2026-10-01", email: null });
    const outcome = await h.noticeService.sendScheduled({
      tenantId: "a", kind: "due_today", unpaidSince: "2026-10-01", graceEndsOn: "2026-10-04", graceDays: 3, owedKobo: 1, daysLeft: null, today: "2026-10-01",
    });
    expect(outcome).toBe("no_contact");
    expect(h.notices.notices.size).toBe(0);
  });

  it("two callers racing for the same notice send it once", async () => {
    const h = await buildEnforcement();
    await h.addTenant("a", { dueDate: "2026-10-01" });
    const input = { tenantId: "a", kind: "due_today" as const, unpaidSince: "2026-10-01", graceEndsOn: "2026-10-04", graceDays: 3, owedKobo: 1, daysLeft: null, today: "2026-10-01" };
    const outcomes = await Promise.all([h.noticeService.sendScheduled(input), h.noticeService.sendScheduled(input)]);
    expect(outcomes.sort()).toEqual(["duplicate", "sent"]);
    expect(h.mail.sent).toHaveLength(1);
  });
});
