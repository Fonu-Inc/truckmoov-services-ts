import "reflect-metadata";
import { describe, expect, it } from "vitest";
import { HttpException } from "@nestjs/common";
import { OnboardingApplicationsController } from "../../../apps/auth/src/onboarding-applications.controller";
import { SystemOnboardingApplicationsController } from "../../../apps/auth/src/system-onboarding-applications.controller";
import { InstallationController } from "../../../apps/auth/src/installation.controller";
import {
  ForbiddenError,
  InvalidAccessTokenError,
  UserNotFoundError,
} from "../../../apps/auth/src/contexts/auth/session";
import { ChargeRefusedError, PaymentProviderUnavailableError } from "@auth/onboarding";

const failing = (error: Error) => ({
  execute: async () => {
    throw error;
  },
});

function withDeps<T>(type: { prototype: T }, deps: Record<string, unknown>): T {
  return Object.assign(Object.create(type.prototype as object), deps) as T;
}

async function statusOf(call: Promise<unknown>) {
  const error = await call.catch((caught: unknown) => caught);
  expect(error).toBeInstanceOf(HttpException);
  const http = error as HttpException;
  return { status: http.getStatus(), message: http.message };
}

describe("Onboarding and installation error statuses", () => {
  it.each([
    [new InvalidAccessTokenError(), 401, "Invalid or expired access token"],
    [new UserNotFoundError(), 401, "User not found"],
    [new ForbiddenError("This account has been disabled"), 403, "This account has been disabled"],
  ])("installation answers %s with %i", async (error, status, message) => {
    const controller = new InstallationController(failing(error) as never, failing(error) as never);

    expect(await statusOf(controller.status("Bearer token"))).toEqual({ status, message });
    expect(await statusOf(controller.confirmInstallation("Bearer token"))).toEqual({ status, message });
  });

  it.each([
    [new ChargeRefusedError(), 402],
    [new PaymentProviderUnavailableError(), 503],
  ])("payment answers %s with %i", async (error, status) => {
    const controller = withDeps(OnboardingApplicationsController, { startPayment: failing(error) });

    expect(await statusOf(controller.pay("app-1", undefined, "token"))).toEqual({
      status,
      message: error.message,
    });
  });

  it("answers a missing admin with 401 on the review routes", async () => {
    const controller = withDeps(SystemOnboardingApplicationsController, {
      listApplications: failing(new UserNotFoundError()),
      getOnboardingReviewSummaryUseCase: failing(new UserNotFoundError()),
    });

    expect((await statusOf(controller.list("Bearer token"))).status).toBe(401);
    expect((await statusOf(controller.summary("Bearer token"))).status).toBe(401);
  });
});
