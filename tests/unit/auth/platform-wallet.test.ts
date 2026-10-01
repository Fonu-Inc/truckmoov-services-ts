import { describe, expect, it } from "vitest";
import { InMemoryTenantWalletRepository } from "../../../apps/auth/src/in-memory-tenant-wallet.repository";
import { InMemoryWalletLedgerRepository } from "../../../apps/auth/src/in-memory-wallet-ledger.repository";
import { ExportTenantWalletsUseCase } from "../../../apps/auth/src/export-tenant-wallets.use-case";
import { ExportCrossTenantLedgerUseCase } from "../../../apps/auth/src/export-cross-tenant-ledger.use-case";
import {
  ListCrossTenantLedgerUseCase,
  ListTenantWalletsUseCase,
  PlatformTopUpError,
  PlatformTopUpWalletUseCase,
  UpdateWalletCreditSettingsUseCase,
} from "../../../apps/auth/src/platform-wallet.use-cases";

const NAIRA = 100;
const ACTOR = { id: "admin-1", email: "ops@truckmoov.com", role: "SYSTEM_ADMIN" };

const tokenService = {
  resolveAccessToken: () => ({ sub: ACTOR.id, tenantId: "system", role: ACTOR.role }),
} as never;

const userRepository = {
  findById: async () => ({ ...ACTOR, status: "active", tenantId: "system" }),
} as never;

class FakeActivityLog {
  readonly entries: Array<Record<string, unknown>> = [];

  async record(entry: Record<string, unknown>) {
    this.entries.push(entry);
  }
}

function harness() {
  const wallets = new InMemoryTenantWalletRepository();
  const ledger = new InMemoryWalletLedgerRepository(wallets);
  const activityLog = new FakeActivityLog();

  return {
    wallets,
    ledger,
    activityLog,
    topUp: new PlatformTopUpWalletUseCase(
      tokenService,
      userRepository,
      wallets,
      activityLog as never,
    ),
    settings: new UpdateWalletCreditSettingsUseCase(
      tokenService,
      userRepository,
      wallets,
      activityLog as never,
    ),
    list: new ListTenantWalletsUseCase(tokenService, userRepository, wallets),
    listLedger: new ListCrossTenantLedgerUseCase(tokenService, userRepository, ledger),
    exportWallets: new ExportTenantWalletsUseCase(tokenService, userRepository, wallets),
    exportLedger: new ExportCrossTenantLedgerUseCase(tokenService, userRepository, ledger),
  };
}

describe("Platform top-up", () => {
  it("credits a tenant that has never had a wallet", async () => {
    const kit = harness();

    const result = await kit.topUp.execute({
      accessToken: "token",
      tenantId: "tenant-a",
      amountKobo: 50_000 * NAIRA,
      reason: "Bank transfer REF-8891",
    });

    // A transfer can land before a tenant has ever used the app.
    expect(result.balanceAfterKobo).toBe(50_000 * NAIRA);
  });

  it("attributes the credit to the staff member with their reason", async () => {
    const kit = harness();

    await kit.topUp.execute({
      accessToken: "token",
      tenantId: "tenant-a",
      amountKobo: 50_000 * NAIRA,
      reason: "Bank transfer REF-8891",
    });

    // This is money created by staff action, so it has to be justified and
    // recorded where it cannot be edited afterwards.
    const logged = kit.activityLog.entries.at(-1);
    expect(logged?.action).toBe("wallet.platform_top_up");
    expect(logged?.actorId).toBe(ACTOR.id);
    expect((logged?.metadata as Record<string, unknown>)?.reason).toBe("Bank transfer REF-8891");
  });

  it("writes a ledger line naming the staff member", async () => {
    const kit = harness();
    await kit.topUp.execute({
      accessToken: "token",
      tenantId: "tenant-a",
      amountKobo: 50_000 * NAIRA,
      reason: "Goodwill credit",
    });

    const { items } = await kit.ledger.listAcrossTenants({});
    expect(items[0]?.category).toBe("goodwill");
    expect(items[0]?.reason).toContain("Goodwill credit");
    expect(items[0]?.reference).toBe(`staff:${ACTOR.id}`);
  });

  it("refuses a top-up with no reason", async () => {
    const kit = harness();

    await expect(() =>
      kit.topUp.execute({
        accessToken: "token",
        tenantId: "tenant-a",
        amountKobo: 1_000 * NAIRA,
        reason: "   ",
      }),
    ).rejects.toBeInstanceOf(PlatformTopUpError);
  });

  it("records the credit as goodwill, not a paid top-up", async () => {
    const kit = harness();

    await kit.topUp.execute({
      accessToken: "token",
      tenantId: "tenant-a",
      amountKobo: 1_000 * NAIRA,
      reason: "Goodwill",
    });

    const { items } = await kit.ledger.listAcrossTenants({});
    expect(items.map((item) => item.category)).toEqual(["goodwill"]);
  });

  it("credits once for a repeated idempotency key", async () => {
    const kit = harness();
    const command = {
      accessToken: "token",
      tenantId: "tenant-a",
      amountKobo: 1_000 * NAIRA,
      reason: "Transfer",
      idempotencyKey: "k-1",
    };

    await kit.topUp.execute(command);
    const second = await kit.topUp.execute(command);

    expect(second.balanceAfterKobo).toBe(1_000 * NAIRA);
    expect(kit.activityLog.entries).toHaveLength(1);
  });

  it("credits each request separately when no key is given", async () => {
    const kit = harness();
    const command = { accessToken: "token", tenantId: "tenant-a", amountKobo: 1_000 * NAIRA, reason: "Transfer" };

    await kit.topUp.execute(command);
    const second = await kit.topUp.execute(command);

    expect(second.balanceAfterKobo).toBe(2_000 * NAIRA);
  });

  it("refuses a zero or negative amount", async () => {
    const kit = harness();

    for (const amountKobo of [0, -500]) {
      await expect(() =>
        kit.topUp.execute({
          accessToken: "token",
          tenantId: "tenant-a",
          amountKobo,
          reason: "Correction",
        }),
      ).rejects.toBeInstanceOf(PlatformTopUpError);
    }
  });
});

describe("Wallet credit settings", () => {
  it("stores an omitted limit as unlimited rather than zero", async () => {
    const kit = harness();

    const wallet = await kit.settings.execute({
      accessToken: "token",
      tenantId: "tenant-a",
      creditEnabled: true,
      creditLimitKobo: null,
      lowBalanceThresholdKobo: 200_000 * NAIRA,
    });

    expect(wallet.creditLimitKobo).toBeNull();
  });

  it("lets a tenant spend into credit once a limit is set", async () => {
    const kit = harness();
    await kit.settings.execute({
      accessToken: "token",
      tenantId: "tenant-a",
      creditEnabled: true,
      creditLimitKobo: 10_000 * NAIRA,
      lowBalanceThresholdKobo: 200_000 * NAIRA,
    });

    const debited = await kit.wallets.debit("tenant-a", 8_000 * NAIRA, {
      category: "sms",
      quantity: 1,
      unitRateKobo: 8_000 * NAIRA,
      reason: "bulk send",
    });

    expect(debited.ok).toBe(true);
    expect(debited.balanceAfterKobo).toBe(-8_000 * NAIRA);
  });

  it("refuses the debit that would break the credit limit", async () => {
    const kit = harness();
    await kit.settings.execute({
      accessToken: "token",
      tenantId: "tenant-a",
      creditEnabled: true,
      creditLimitKobo: 10_000 * NAIRA,
      lowBalanceThresholdKobo: 200_000 * NAIRA,
    });

    const debited = await kit.wallets.debit("tenant-a", 10_001 * NAIRA, {
      category: "sms",
      quantity: 1,
      unitRateKobo: 10_001 * NAIRA,
      reason: "bulk send",
    });

    // A tenant at their ceiling that can still send is not a limit.
    expect(debited.ok).toBe(false);
    expect(debited.balanceAfterKobo).toBeNull();
  });

  it("refuses to go negative when credit is off", async () => {
    const kit = harness();
    await kit.wallets.ensure("tenant-a");

    const debited = await kit.wallets.debit("tenant-a", 1, {
      category: "sms",
      quantity: 1,
      unitRateKobo: 1,
      reason: "one message",
    });

    expect(debited.ok).toBe(false);
  });

  it("records who changed the credit terms", async () => {
    const kit = harness();
    await kit.settings.execute({
      accessToken: "token",
      tenantId: "tenant-a",
      creditEnabled: true,
      creditLimitKobo: 10_000 * NAIRA,
      lowBalanceThresholdKobo: 200_000 * NAIRA,
    });

    const logged = kit.activityLog.entries.at(-1);
    expect(logged?.action).toBe("wallet.credit_settings_changed");
    expect(logged?.actorId).toBe(ACTOR.id);
  });
});

describe("Platform wallet list", () => {
  async function seed(kit: ReturnType<typeof harness>) {
    // Same balance, different thresholds: one healthy, one low.
    await kit.settings.execute({
      accessToken: "token",
      tenantId: "healthy-tenant",
      creditEnabled: false,
      creditLimitKobo: null,
      lowBalanceThresholdKobo: 200_000 * NAIRA,
    });
    await kit.settings.execute({
      accessToken: "token",
      tenantId: "low-tenant",
      creditEnabled: false,
      creditLimitKobo: null,
      lowBalanceThresholdKobo: 500_000 * NAIRA,
    });
    for (const tenantId of ["healthy-tenant", "low-tenant"]) {
      await kit.topUp.execute({
        accessToken: "token",
        tenantId,
        amountKobo: 300_000 * NAIRA,
        reason: "seed",
      });
    }
  }

  it("derives status against each tenant's own threshold", async () => {
    const kit = harness();
    await seed(kit);

    const { wallets } = await kit.list.execute("token");
    const byTenant = Object.fromEntries(wallets.map((w) => [w.tenantId, w.status]));

    // The same balance reads differently because the thresholds differ. A
    // single platform figure would label one of them wrongly.
    expect(byTenant["healthy-tenant"]).toBe("healthy");
    expect(byTenant["low-tenant"]).toBe("low");
  });

  it("counts the summary figures over every wallet, not the filtered view", async () => {
    const kit = harness();
    await seed(kit);

    const filtered = await kit.list.execute("token", { status: "low" });

    expect(filtered.wallets).toHaveLength(1);
    expect(filtered.summary.totalWallets).toBe(2);
    expect(filtered.summary.totalBalanceKobo).toBe(600_000 * NAIRA);
    expect(filtered.summary.lowBalance).toBe(1);
  });

  it("counts a wallet running on credit as negative", async () => {
    const kit = harness();
    await kit.settings.execute({
      accessToken: "token",
      tenantId: "tenant-a",
      creditEnabled: true,
      creditLimitKobo: 10_000 * NAIRA,
      lowBalanceThresholdKobo: 200_000 * NAIRA,
    });
    await kit.wallets.debit("tenant-a", 5_000 * NAIRA, {
      category: "sms",
      quantity: 1,
      unitRateKobo: 5_000 * NAIRA,
      reason: "send",
    });

    const { summary } = await kit.list.execute("token");
    expect(summary.negativeBalance).toBe(1);
  });
});

describe("Cross-tenant ledger", () => {
  it("keeps each tenant's lines together so the running balance reads correctly", async () => {
    const kit = harness();
    for (const tenantId of ["tenant-b", "tenant-a"]) {
      for (let index = 0; index < 2; index += 1) {
        await kit.topUp.execute({
          accessToken: "token",
          tenantId,
          amountKobo: 1_000 * NAIRA,
          reason: `transfer ${index}`,
        });
      }
    }

    const { items, total } = await kit.listLedger.execute("token", {});

    expect(total).toBe(4);
    // Grouped per tenant. Interleaving them would show one tenant's balance
    // jumping around another's.
    expect(items.map((entry) => entry.tenantId)).toEqual([
      "tenant-a",
      "tenant-a",
      "tenant-b",
      "tenant-b",
    ]);
  });

  it("searches tenant, description and reference", async () => {
    const kit = harness();
    await kit.topUp.execute({
      accessToken: "token",
      tenantId: "tenant-a",
      amountKobo: 1_000 * NAIRA,
      reason: "Bank transfer REF-8891",
    });
    await kit.topUp.execute({
      accessToken: "token",
      tenantId: "tenant-b",
      amountKobo: 1_000 * NAIRA,
      reason: "Goodwill",
    });

    expect((await kit.listLedger.execute("token", { query: "REF-8891" })).total).toBe(1);
    expect((await kit.listLedger.execute("token", { query: "tenant-b" })).total).toBe(1);
  });

  it("filters to one tenant", async () => {
    const kit = harness();
    for (const tenantId of ["tenant-a", "tenant-b"]) {
      await kit.topUp.execute({
        accessToken: "token",
        tenantId,
        amountKobo: 1_000 * NAIRA,
        reason: "seed",
      });
    }

    const { total } = await kit.listLedger.execute("token", { tenantId: "tenant-a" });
    expect(total).toBe(1);
  });
});

describe("Wallet export", () => {
  it("exports wallets as CSV including every column", async () => {
    const kit = harness();
    await kit.topUp.execute({
      accessToken: "token",
      tenantId: "tenant-a",
      amountKobo: 50_000 * NAIRA,
      reason: "seed",
    });

    const result = await kit.exportWallets.execute("token", {});
    expect(result.contentType).toContain("text/csv");
    const csv = result.buffer.toString("utf-8");
    expect(csv).toContain("Tenant ID");
    expect(csv).toContain("tenant-a");
  });

  it("exports only the filtered status", async () => {
    const kit = harness();
    await kit.settings.execute({
      accessToken: "token",
      tenantId: "healthy-tenant",
      creditEnabled: false,
      creditLimitKobo: null,
      lowBalanceThresholdKobo: 200_000 * NAIRA,
    });
    await kit.settings.execute({
      accessToken: "token",
      tenantId: "low-tenant",
      creditEnabled: false,
      creditLimitKobo: null,
      lowBalanceThresholdKobo: 500_000 * NAIRA,
    });
    for (const tenantId of ["healthy-tenant", "low-tenant"]) {
      await kit.topUp.execute({ accessToken: "token", tenantId, amountKobo: 300_000 * NAIRA, reason: "seed" });
    }

    const result = await kit.exportWallets.execute("token", { status: "low" });
    const csv = result.buffer.toString("utf-8");
    expect(csv).toContain("low-tenant");
    expect(csv).not.toContain("healthy-tenant");
  });

  it("exports xlsx when asked", async () => {
    const kit = harness();
    await kit.topUp.execute({ accessToken: "token", tenantId: "tenant-a", amountKobo: 1_000 * NAIRA, reason: "seed" });

    const result = await kit.exportWallets.execute("token", { format: "xlsx" });
    expect(result.ext).toBe("xlsx");
    expect(result.contentType).toContain("spreadsheetml");
  });

  it("exports the cross-tenant ledger with each tenant's lines", async () => {
    const kit = harness();
    for (const tenantId of ["tenant-a", "tenant-b"]) {
      await kit.topUp.execute({ accessToken: "token", tenantId, amountKobo: 1_000 * NAIRA, reason: "seed" });
    }

    const result = await kit.exportLedger.execute("token", {});
    const csv = result.buffer.toString("utf-8");
    expect(csv).toContain("tenant-a");
    expect(csv).toContain("tenant-b");
  });

  it("filters the ledger export to one tenant", async () => {
    const kit = harness();
    for (const tenantId of ["tenant-a", "tenant-b"]) {
      await kit.topUp.execute({ accessToken: "token", tenantId, amountKobo: 1_000 * NAIRA, reason: "seed" });
    }

    const result = await kit.exportLedger.execute("token", { tenantId: "tenant-a" });
    const csv = result.buffer.toString("utf-8");
    expect(csv).toContain("tenant-a");
    expect(csv).not.toContain("tenant-b");
  });

  it("neutralizes a reason that starts with a formula character", async () => {
    const kit = harness();
    await kit.wallets.ensure("tenant-a");
    await kit.wallets.credit("tenant-a", 1_000 * NAIRA, {
      category: "adjustment",
      quantity: 1,
      unitRateKobo: 1_000 * NAIRA,
      reason: "=cmd|'/c calc'!A1",
    });

    const result = await kit.exportLedger.execute("token", {});
    const csv = result.buffer.toString("utf-8");
    expect(csv).not.toMatch(/,=cmd/);
    expect(csv).toContain("'=cmd");
  });
});
