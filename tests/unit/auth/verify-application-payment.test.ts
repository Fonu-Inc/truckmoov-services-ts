import { beforeEach, describe, expect, it, vi } from "vitest";
import { VerifyApplicationPaymentUseCase } from "@auth/onboarding/application/use-cases/verify-application-payment.use-case";
import { PaymentGatewayError } from "../../../apps/auth/src/contexts/payments";

const ORDER = { status: true, message: "success", data: { stage: "installation" } };

describe("VerifyApplicationPaymentUseCase", () => {
  let payment: { reference: string; status: string } | null;
  let gateway: { isConfigured: ReturnType<typeof vi.fn>; verifyCharge: ReturnType<typeof vi.fn> };
  let confirm: { execute: ReturnType<typeof vi.fn> };
  let order: { execute: ReturnType<typeof vi.fn> };
  let restore: { onApplicationPaymentSettled: ReturnType<typeof vi.fn> };
  let useCase: VerifyApplicationPaymentUseCase;

  beforeEach(() => {
    payment = { reference: "FPA-1", status: "pending" };
    gateway = {
      isConfigured: vi.fn(() => true),
      verifyCharge: vi.fn(async () => ({ paid: true, amountKobo: 8_000_000, currency: "NGN", channel: "card" })),
    };
    confirm = { execute: vi.fn(async () => undefined) };
    order = { execute: vi.fn(async () => ORDER) };
    restore = { onApplicationPaymentSettled: vi.fn(async () => undefined) };
    useCase = new VerifyApplicationPaymentUseCase(
      { resolve: vi.fn(async () => ({ id: "app-1" })) } as never,
      { findLatestForApplication: vi.fn(async () => payment) } as never,
      gateway as never,
      confirm as never,
      order as never,
      restore as never,
    );
  });

  it("confirms a pending charge the provider says was paid", async () => {
    await expect(useCase.execute("app-1", "token")).resolves.toBe(ORDER);
    expect(gateway.verifyCharge).toHaveBeenCalledWith("FPA-1");
    expect(confirm.execute).toHaveBeenCalledWith("FPA-1", true, expect.objectContaining({ amountKobo: 8_000_000, currency: "NGN" }));
    expect(restore.onApplicationPaymentSettled).toHaveBeenCalledWith("FPA-1");
  });

  it("leaves an unpaid charge pending", async () => {
    gateway.verifyCharge.mockResolvedValue({ paid: false, amountKobo: null, currency: null, channel: null });
    await expect(useCase.execute("app-1", "token")).resolves.toBe(ORDER);
    expect(confirm.execute).not.toHaveBeenCalled();
  });

  it("does not ask the provider again once the payment is confirmed", async () => {
    payment = { reference: "FPA-1", status: "paid" };
    await expect(useCase.execute("app-1", "token")).resolves.toBe(ORDER);
    expect(gateway.verifyCharge).not.toHaveBeenCalled();
    expect(confirm.execute).not.toHaveBeenCalled();
  });

  it("returns the order when there is no payment yet", async () => {
    payment = null;
    await expect(useCase.execute("app-1", "token")).resolves.toBe(ORDER);
    expect(gateway.verifyCharge).not.toHaveBeenCalled();
  });

  it("still returns the order when the provider cannot be reached", async () => {
    gateway.verifyCharge.mockRejectedValue(new PaymentGatewayError("paystack", "timeout"));
    await expect(useCase.execute("app-1", "token")).resolves.toBe(ORDER);
    expect(confirm.execute).not.toHaveBeenCalled();
  });

  it("skips the lookup when no provider is configured", async () => {
    gateway.isConfigured.mockReturnValue(false);
    await expect(useCase.execute("app-1", "token")).resolves.toBe(ORDER);
    expect(gateway.verifyCharge).not.toHaveBeenCalled();
  });
});
