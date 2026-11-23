import { describe, expect, it, vi } from "vitest";
import {
  OnboardingValidationError,
  validateBillingEmail,
  validateSignerName,
} from "@auth/onboarding/domain/onboarding-application.validation";
import {
  ChannelAlreadyVerifiedError,
  SendOnboardingVerificationCodeUseCase,
  VerificationResendTooSoonError,
} from "@auth/onboarding/application/use-cases/verify-onboarding-application-contact.use-cases";
import { RequestApplicationDevicesUseCase } from "@auth/onboarding/application/use-cases/manage-application-device-requests.use-cases";
import { SubmitOnboardingApplicationUseCase } from "@auth/onboarding/application/use-cases/submit-onboarding-application.use-case";
import { InMemoryOnboardingApplicationRepository } from "@auth/onboarding/infrastructure/persistence/in-memory-onboarding-application.repository";

function fieldOf(fn: () => unknown) {
  try {
    fn();
  } catch (error) {
    if (error instanceof OnboardingValidationError) {
      return { field: error.field, message: error.message };
    }
    throw error;
  }
  throw new Error("expected a validation error");
}

describe("field names on applicant validation errors", () => {
  it("reports a bad billing email under billingEmail, in billing words", () => {
    expect(fieldOf(() => validateBillingEmail("nope"))).toEqual({
      field: "billingEmail",
      message: "Billing email must contain a single @",
    });
  });

  it("still accepts a good billing email", () => {
    expect(validateBillingEmail("Accounts@Example.com")).toBe("accounts@example.com");
  });

  it("reports a missing signer name under signer_name", () => {
    expect(fieldOf(() => validateSignerName(undefined))).toEqual({
      field: "signer_name",
      message: "Company name must be between 2 and 160 characters",
    });
  });

  it("holds the signer to the company name rules", () => {
    expect(fieldOf(() => validateSignerName("123")).field).toBe("signer_name");
    expect(validateSignerName("  Dedede   Ltd ")).toBe("Dedede Ltd");
    expect(validateSignerName("Dedede")).toBe("Dedede");
  });
});

describe("sending a verification code", () => {
  const application = (overrides: Record<string, unknown> = {}) =>
    ({
      id: "a1",
      organizationName: "Arne Logistics",
      organizationPhone: "+2348012345678",
      businessEmail: "ops@arne.test",
      billingEmail: "pay@arne.test",
      status: "draft",
      emailVerifiedAt: null,
      phoneVerifiedAt: null,
      billingEmailVerifiedAt: null,
      ...overrides,
    }) as never;

  function build(app: unknown, latest: { createdAt: Date } | null) {
    const applications = {
      findLatestVerificationCode: vi.fn(async () => latest),
      countRecentVerificationCodes: vi.fn(async () => 0),
      invalidateVerificationCodes: vi.fn(async () => undefined),
      saveVerificationCode: vi.fn(async () => undefined),
    };
    const notifier = { sendEmailCode: vi.fn(async () => undefined), sendSmsCode: vi.fn(async () => undefined) };
    const useCase = Reflect.construct(SendOnboardingVerificationCodeUseCase, [
      applications,
      { findLatestForApplication: vi.fn(async () => null) },
      { generate: () => "id" },
      notifier,
      { resolve: vi.fn(async () => app) },
    ]) as SendOnboardingVerificationCodeUseCase;
    return { useCase, applications, notifier };
  }

  const input = (channel: "email" | "sms" | "billing_email") => ({
    applicationId: "a1",
    applicationToken: "t",
    channel,
  });

  // The cooldown follows the newest code sent. A code used up by wrong
  // attempts is no longer live, and asking again straight away is what the
  // cooldown exists to stop.
  it("holds the cooldown even when the previous code is no longer live", async () => {
    const { useCase, notifier } = build(application(), { createdAt: new Date(Date.now() - 5_000) });

    await expect(useCase.execute(input("sms"))).rejects.toBeInstanceOf(VerificationResendTooSoonError);
    expect(notifier.sendSmsCode).not.toHaveBeenCalled();
  });

  it("sends once the cooldown has passed", async () => {
    const { useCase, notifier } = build(application(), { createdAt: new Date(Date.now() - 61_000) });

    const result = await useCase.execute(input("sms"));

    expect(result.data.resendAfterSeconds).toBe(60);
    expect(notifier.sendSmsCode).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["email", "emailVerifiedAt"],
    ["sms", "phoneVerifiedAt"],
    ["billing_email", "billingEmailVerifiedAt"],
  ] as const)("does not send a %s code to a channel that is already verified", async (channel, column) => {
    const { useCase, notifier } = build(application({ [column]: new Date() }), null);

    await expect(useCase.execute(input(channel))).rejects.toBeInstanceOf(ChannelAlreadyVerifiedError);
    expect(notifier.sendEmailCode).not.toHaveBeenCalled();
    expect(notifier.sendSmsCode).not.toHaveBeenCalled();
  });
});

describe("requesting devices", () => {
  const app = {
    id: "a1",
    reference: "APP-1",
    applicantType: "owner_operator",
    status: "draft",
    stage: "application",
    organizationName: "Arne Logistics",
    submittedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as never;

  async function build(stock: { tracked: boolean; availableQuantity: number }, vehicles = 2) {
    const applications = new InMemoryOnboardingApplicationRepository();
    await applications.save(app);
    for (let i = 0; i < vehicles; i += 1) {
      await applications.saveVehicle({
        id: `v${i}`,
        applicationId: "a1",
        registrationNumber: `LAG-00${i}-AA`,
        chassisNumber: null,
        createdAt: new Date(Date.now() + i),
        updatedAt: new Date(),
      } as never);
    }
    const inventory = { availability: vi.fn(async () => stock) };
    let n = 0;
    const useCase = Reflect.construct(RequestApplicationDevicesUseCase, [
      applications,
      { resolve: vi.fn(async () => app) },
      inventory,
      { generate: () => `id-${++n}` },
    ]) as RequestApplicationDevicesUseCase;
    return { useCase, applications, inventory };
  }

  const request = (overrides: Record<string, unknown> = {}) => ({
    applicationId: "a1",
    applicationToken: "t",
    quantity: 1,
    useCase: "Tracking the Lagos fleet",
    ...overrides,
  });

  it("validates the body before it looks at stock", async () => {
    const { useCase, inventory } = await build({ tracked: true, availableQuantity: 0 });

    await expect(useCase.execute(request({ useCase: "short" }))).rejects.toBeInstanceOf(OnboardingValidationError);
    await expect(useCase.execute(request({ useCase: undefined }))).rejects.toBeInstanceOf(OnboardingValidationError);
    expect(inventory.availability).not.toHaveBeenCalled();
  });

  it("reports the quantity that was asked for when stock is short", async () => {
    const { useCase } = await build({ tracked: true, availableQuantity: 0 });

    const result = await useCase.execute(request({ quantity: 1 }));

    expect(result.data).toMatchObject({
      requestSaved: false,
      requiresConfirmation: true,
      requestedQuantity: 1,
      availableQuantity: 0,
    });
  });

  it("saves nothing until the shortfall is confirmed", async () => {
    const { useCase, applications } = await build({ tracked: true, availableQuantity: 0 });

    await useCase.execute(request());

    expect(await applications.findDeviceRequestsByApplicationId("a1")).toEqual([]);
  });

  // With nothing on the shelf, confirming used to be impossible: it had to
  // name the available quantity, which is zero, and zero is not a valid order.
  it("saves the request as asked once the shortfall is confirmed, even with no stock", async () => {
    const { useCase, applications } = await build({ tracked: true, availableQuantity: 0 });

    const result = await useCase.execute(request({ quantity: 2, confirmAvailableQuantity: true }));

    expect(result.data).toMatchObject({ requestSaved: true, requestedQuantity: 2 });
    const saved = await applications.findDeviceRequestsByApplicationId("a1");
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ quantity: 2, confirmedAvailableQuantity: 0 });
  });

  it("does not need confirmation when stock covers the fleet", async () => {
    const { useCase } = await build({ tracked: true, availableQuantity: 10 });

    const result = await useCase.execute(request({ quantity: 2 }));

    expect(result.data).toMatchObject({ requestSaved: true, requestedQuantity: 2 });
  });

  it("still refuses more devices than vehicles", async () => {
    const { useCase } = await build({ tracked: true, availableQuantity: 10 });

    await expect(useCase.execute(request({ quantity: 3 }))).rejects.toBeInstanceOf(OnboardingValidationError);
  });
});

describe("the submit gate for devices", () => {
  const gate = (fleet: Record<string, unknown>) => {
    const useCase = Reflect.construct(SubmitOnboardingApplicationUseCase, new Array(9).fill({})) as unknown as {
      assertComplete(app: unknown, fleet: unknown): void;
    };
    try {
      useCase.assertComplete(
        { emailVerifiedAt: new Date(), phoneVerifiedAt: new Date(), m2mPlanCode: "p" },
        {
          missingDocuments: [],
          vehiclesMissing: [],
          vehicleCount: 2,
          requestedDevices: 2,
          confirmedAvailableQuantity: null,
          indemnitySigned: true,
          planSelected: true,
          inventoryTracked: true,
          availableDevices: 5,
          ...fleet,
        },
      );
    } catch (error) {
      return (error as { details: Record<string, unknown> }).details;
    }
    return null;
  };

  it("passes with one device per vehicle", () => {
    expect(gate({ requestedDevices: 2 })).toBeNull();
  });

  it("names the failed gate when devices are short of vehicles", () => {
    expect(gate({ requestedDevices: 0 })).toMatchObject({
      deviceAllocationComplete: false,
      inventoryShortfallAccepted: false,
    });
  });

  it("accepts fewer devices only when the disclosed shortfall was confirmed", () => {
    expect(gate({ requestedDevices: 1, confirmedAvailableQuantity: 1 })).toBeNull();
    expect(gate({ requestedDevices: 1, confirmedAvailableQuantity: 0 })).toMatchObject({
      deviceAllocationComplete: false,
    });
  });

  it("carries the flags on a 400 for some other reason, too", () => {
    expect(gate({ requestedDevices: 2, indemnitySigned: false })).toMatchObject({
      deviceAllocationComplete: true,
      inventoryShortfallAccepted: false,
    });
  });
});
