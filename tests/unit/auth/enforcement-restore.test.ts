import "reflect-metadata";
import { describe, expect, it } from "vitest";
import { InsufficientWalletBalanceError } from "../../../apps/auth/src/charge-usage.use-case";
import { buildEnforcement, type Harness } from "./enforcement-harness";

async function suspended(h: Harness, id = "a") {
  await h.addTenant(id, { dueDate: "2026-09-01" });
  await h.runDay("2026-10-01");
  await h.runDay("2026-10-02");
  expect((await h.suspensions.findOne(id))?.cause).toBe("non_payment");
}

describe("auto restore on payment", () => {
  it("restores everything, audits and emails once when nothing is left unpaid", async () => {
    const h = await buildEnforcement();
    await suspended(h);
    h.pay("a");

    await h.restore.onPaymentSettled("a", "invoice_paid");
    await h.restore.onPaymentSettled("a", "invoice_paid");

    expect(await h.suspensions.findOne("a")).toBeNull();
    expect(await h.userStatus("a-u0")).toBe("enabled");
    expect(h.fleet.reinstateTenantAssets).toHaveBeenCalledWith("a", "non_payment");
    expect(h.kinds("a").filter((k) => k === "restored")).toHaveLength(1);
    const restored = h.audits.filter((a) => a.action === "system.tenant.auto_restored");
    expect(restored).toHaveLength(1);
    expect(restored[0]).toMatchObject({ userId: "system", metadata: { trigger: "invoice_paid" } });
    expect(h.published).toContain("tenant.assets.restored");
  });

  it("does not restore after a partial payment", async () => {
    const h = await buildEnforcement();
    await suspended(h);
    h.arrears.invoiceItems.set("a", [{ source: "invoice", reference: "INV-a", dueDate: "2026-09-01", owedKobo: 40_000 }]);

    await h.restore.onPaymentSettled("a", "invoice_paid");

    expect(await h.suspensions.findOne("a")).not.toBeNull();
    expect(await h.userStatus("a-u0")).toBe("disabled");
    expect(h.kinds("a")).not.toContain("restored");
  });

  it("pays unpaid SIM charges from the wallet first, then restores", async () => {
    const h = await buildEnforcement();
    await h.addTenant("a", { dueDate: "2026-09-01" });
    h.pay("a");
    await h.arrears.record({ tenantId: "a", reference: "sim-monthly:a:2026-09", dueDate: "2026-09-01", amountKobo: 50_000, quantity: 3 });
    await h.runDay("2026-10-01");
    await h.runDay("2026-10-02");
    expect(await h.suspensions.findOne("a")).not.toBeNull();
    h.chargeUsage.execute.mockResolvedValue({ charged: true, replayed: false });

    await h.restore.onPaymentSettled("a", "wallet_topup");

    expect(h.chargeUsage.execute).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "a", channel: "iot_sim", quantity: 3, reference: "sim-monthly:a:2026-09" }),
    );
    expect(h.arrears.arrears[0].resolution).toBe("paid");
    expect(await h.suspensions.findOne("a")).toBeNull();
    expect(await h.userStatus("a-u0")).toBe("enabled");
  });

  it("stays suspended when the wallet still cannot cover the SIM charge", async () => {
    const h = await buildEnforcement();
    await h.addTenant("a", { dueDate: "2026-09-01" });
    h.pay("a");
    await h.arrears.record({ tenantId: "a", reference: "sim-monthly:a:2026-09", dueDate: "2026-09-01", amountKobo: 50_000, quantity: 1 });
    await h.runDay("2026-10-01");
    await h.runDay("2026-10-02");
    h.chargeUsage.execute.mockRejectedValue(new InsufficientWalletBalanceError(50_000));

    await h.restore.onPaymentSettled("a", "wallet_topup");

    expect(h.arrears.arrears[0].resolution).toBeNull();
    expect(await h.suspensions.findOne("a")).not.toBeNull();
  });

  it("never throws", async () => {
    const h = await buildEnforcement();
    await suspended(h);
    h.pay("a");
    h.fleet.reinstateTenantAssets.mockRejectedValue(new Error("boom"));
    await expect(h.restore.onPaymentSettled("a", "subscription")).resolves.toBeUndefined();
  });

  it("finishes a restore the fleet could not complete, on a later tick", async () => {
    const h = await buildEnforcement();
    await suspended(h);
    h.pay("a");
    h.fleet.reinstateTenantAssets.mockResolvedValueOnce({ ok: false, message: "fleet down" } as never);

    await h.restore.onPaymentSettled("a", "invoice_paid");
    expect((await h.suspensions.findOne("a"))?.cascadeStatus).toBe("restore_partial");
    expect(h.kinds("a")).not.toContain("restored");

    await h.runDay("2026-10-02", 10);

    expect(await h.suspensions.findOne("a")).toBeNull();
    expect(h.kinds("a").filter((k) => k === "restored")).toHaveLength(1);
    expect(h.audits.filter((a) => a.action === "system.tenant.auto_restored")).toHaveLength(1);
  });

  it("restores through the safety net when the payment hook never ran", async () => {
    const h = await buildEnforcement();
    await suspended(h);
    h.pay("a");

    const tick = await h.runDay("2026-10-02", 10);

    expect(tick.restored).toBe(1);
    expect(await h.userStatus("a-u0")).toBe("enabled");
  });

  it("finds the customer behind an onboarding payment", async () => {
    const h = await buildEnforcement();
    await suspended(h);
    h.pay("a");
    h.payments.findByReference.mockResolvedValue({ applicationId: "app1" } as never);
    h.applications.findById.mockResolvedValue({ tenantId: "a" } as never);

    await h.restore.onApplicationPaymentSettled("ref-1");

    expect(await h.suspensions.findOne("a")).toBeNull();
    expect(h.audits.find((a) => a.action === "system.tenant.auto_restored")?.metadata).toMatchObject({ trigger: "invoice_paid" });
  });

  it("ignores a payment that belongs to no customer yet", async () => {
    const h = await buildEnforcement();
    h.payments.findByReference.mockResolvedValue({ applicationId: "app1" } as never);
    h.applications.findById.mockResolvedValue({ tenantId: null } as never);
    await expect(h.restore.onApplicationPaymentSettled("ref-2")).resolves.toBeUndefined();
    expect(h.audits).toEqual([]);
  });
});