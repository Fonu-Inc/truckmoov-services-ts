import { vi } from "vitest";
import { InMemoryUserRepository } from "../../../apps/auth/src/contexts/auth/session/infrastructure/in-memory-user.repository";
import { InMemorySimRepository } from "../../../apps/auth/src/in-memory-sim.repository";
import { InMemoryTenantSuspensionRepository } from "../../../apps/auth/src/mikro-tenant-suspension.repository";
import { InMemoryTenantAssetStore } from "../../../apps/auth/src/tenant-asset-store";
import { TenantSuspensionService } from "../../../apps/auth/src/tenant-suspension.service";
import { InMemoryEnforcementSettingsRepository } from "../../../apps/auth/src/in-memory-enforcement.repositories";
import {
  InMemoryArrearsRepository,
  InMemoryEnforcementNoticeRepository,
  InMemoryEnforcementRunRepository,
} from "../../../apps/auth/src/in-memory-enforcement-automation.repositories";
import { EnforcementAudit } from "../../../apps/auth/src/enforcement-audit";
import { EnforcementNoticeService } from "../../../apps/auth/src/enforcement-notice.service";
import { EnforcementPlanService } from "../../../apps/auth/src/enforcement-plan.service";
import { EnforcementRestoreService } from "../../../apps/auth/src/enforcement-restore.service";
import { EnforcementSweepService } from "../../../apps/auth/src/enforcement-sweep.service";
import type {
  EnforcementQueriesRepository,
  EnforcementStagedRow,
} from "../../../apps/auth/src/enforcement-queries.repository";
import { computeTiming } from "../../../apps/auth/src/contexts/onboarding/domain/enforcement-stage";
import { addDaysToDate, lagosDate } from "../../../apps/auth/src/contexts/onboarding/domain/invoice-dates";
import type { EnforcementEmail } from "../../../apps/auth/src/contexts/onboarding/domain/ports/enforcement-notifier.port";
import type { StoredSim } from "../../../apps/auth/src/sim.repository";

export function sim(id: string, tenantId: string): StoredSim {
  return {
    id, iccid: id, imsi: null, msisdn: null, carrier: "MTN", plan: "iot_basic", status: "assigned",
    tenantId, deviceId: `dev-${id}`, deviceName: null, deviceImei: `imei-${id}`, deviceType: null,
    vehicleId: null, suspensionReason: null, notes: null, dataUsageMb: 0, dataLimitMb: 0, smsUsage: 0,
    smsLimit: 0, monthlyCostNgn: 0, activationDate: null, expiryDate: null, lastActivity: null,
    signalStrength: null, networkType: null, roaming: false, fonuSimId: null, fonuStatus: null,
    createdAt: new Date(), updatedAt: new Date(),
  };
}

export type TenantSetup = { dueDate: string; owedKobo?: number; email?: string | null; users?: number };

export async function buildEnforcement() {
  const clock = { now: new Date("2026-10-01T09:00:00+01:00") };
  const users = new InMemoryUserRepository();
  const sims = new InMemorySimRepository();
  const suspensions = new InMemoryTenantSuspensionRepository();
  const store = new InMemoryTenantAssetStore(users, sims);
  const settings = new InMemoryEnforcementSettingsRepository();
  await settings.update({ autoSuspendEnabled: true }, "test");
  const notices = new InMemoryEnforcementNoticeRepository();
  notices.now = () => clock.now;
  const arrears = new InMemoryArrearsRepository();
  const runs = new InMemoryEnforcementRunRepository();

  const published: string[] = [];
  const fleet = {
    suspendTenantAssets: vi.fn(async () => ({ ok: true, devices: 2, vehicles: 1, shareLinks: 1 })),
    reinstateTenantAssets: vi.fn(async () => ({ ok: true, devices: 2, vehicles: 1, shareLinks: 1 })),
    previewTenantHold: vi.fn(async () => new Map()),
  };
  const suspension = new TenantSuspensionService(
    {} as never, suspensions, users, sims,
    { deleteAllForUser: async () => {} } as never,
    { changed: () => {} } as never,
    fleet as never,
    { publish: async (_s: string, envelope: { type: string }) => { published.push(envelope.type); } } as never,
    { publish: async () => {} },
    store,
  );

  const audits: Array<{ userId: string; action: string; entityId: string; summary: string; metadata?: Record<string, unknown> }> = [];
  const audit = new EnforcementAudit({
    record: async (actor, entry) => { audits.push({ userId: actor.userId, ...entry }); },
  });

  const mail = { sent: [] as EnforcementEmail[], failFor: new Set<string>(), failAll: false };
  const notifier = {
    send: vi.fn(async (email: EnforcementEmail) => {
      if (mail.failAll || mail.failFor.has(email.to)) throw new Error("mail server down");
      mail.sent.push(email);
    }),
  };
  const noticeService = new EnforcementNoticeService(notices, arrears, notifier, audit);

  const chargeUsage = { execute: vi.fn() };
  const applications = { findById: vi.fn(async (_id: string): Promise<unknown> => null) };
  const payments = { findByReference: vi.fn(async (_ref: string): Promise<unknown> => null) };
  const restore = new EnforcementRestoreService(
    arrears, chargeUsage as never, suspension, suspensions, noticeService, audit, payments as never, applications as never,
    { findByTenantId: async () => null } as never,
  );

  const tenants = new Map<string, { name: string }>();
  const queries: EnforcementQueriesRepository = {
    candidates: async (graceDays, today) => {
      const rows: EnforcementStagedRow[] = [];
      for (const [tenantId, info] of tenants) {
        const items = await arrears.openItems(tenantId);
        if (items.length === 0) continue;
        const dueDate = items[0].dueDate;
        const timing = computeTiming(dueDate, graceDays, today);
        const stored = await suspensions.findOne(tenantId);
        const mine = [...notices.notices.values()].filter(
          (n) => n.tenantId === tenantId && n.status === "sent" && n.unpaidSince === dueDate,
        );
        rows.push({
          tenantId, tenantName: info.name, dueDate, graceEndsOn: timing.graceEndsOn, stage: timing.stage,
          owedKobo: items.reduce((sum, i) => sum + i.owedKobo, 0), items: items.length,
          sources: ["invoice"], suspendedAt: stored ? stored.suspendedAt.toISOString() : null,
          suspensionCause: stored?.cause ?? null, reason: stored?.reason ?? null,
          cascadeStatus: stored?.cascadeStatus ?? null,
          hasContact: ((await notices.contactsFor(tenantId)).emails.length > 0),
          lastNoticeKind: null, lastNoticeAt: null, waived: false,
          sentNoticeKeys: mine.map((n) => n.dedupKey),
          finalNoticeSentEarlier: mine.some(
            (n) => n.kind === "final" && lagosDate(n.createdAt) < today
              && today >= addDaysToDate(dueDate, (n.graceDaysAtSend ?? graceDays) + 1),
          ),
        });
      }
      return rows;
    },
    page: async () => ({ rows: [], total: 0 }),
    summary: async () => ({ inGrace: 0, pastGrace: 0, suspendedNonPayment: 0, suspendedManual: 0, owedKobo: 0 }),
  };
  const planner = new EnforcementPlanService(queries, settings);
  const sweep = new EnforcementSweepService(
    { persistence: { backend: "in-memory" } } as never,
    settings, planner, suspension, suspensions, noticeService, restore, runs, arrears, audit,
  );

  async function addTenant(id: string, setup: TenantSetup) {
    tenants.set(id, { name: `Name ${id}` });
    const email = setup.email === undefined ? `${id}@corp.test` : setup.email;
    notices.contacts.set(id, { customerName: `Name ${id}`, emails: email ? [email] : [] });
    arrears.invoiceItems.set(id, [
      { source: "invoice", reference: `INV-${id}`, dueDate: setup.dueDate, owedKobo: setup.owedKobo ?? 100_000 },
    ]);
    for (let i = 0; i < (setup.users ?? 1); i += 1) {
      await users.save({ id: `${id}-u${i}`, email: `${id}-u${i}@x.test`, passwordHash: "x", role: "OWNER_OPERATOR", tenantId: id, accountStatus: "enabled" });
    }
    await sims.save(sim(`${id}-s`, id));
  }

  const pay = (id: string) => arrears.invoiceItems.set(id, []);
  const day = (date: string, hour = 9) => {
    clock.now = new Date(`${date}T${String(hour).padStart(2, "0")}:00:00+01:00`);
  };
  const runDay = (date: string, hour = 9) => {
    day(date, hour);
    return sweep.run(clock.now);
  };
  const userStatus = async (id: string) => (await users.findById(id))?.accountStatus;
  const kinds = (tenantId?: string) =>
    mail.sent.filter((m) => !tenantId || m.customerName === `Name ${tenantId}`).map((m) => m.kind);
  const actions = () => audits.map((a) => a.action);

  return {
    clock, users, sims, suspensions, settings, notices, arrears, runs, fleet, suspension, audits, mail, notifier,
    noticeService, chargeUsage, applications, payments, restore, planner, sweep, published, addTenant, pay, day, runDay, userStatus, kinds, actions,
  };
}

export type Harness = Awaited<ReturnType<typeof buildEnforcement>>;
