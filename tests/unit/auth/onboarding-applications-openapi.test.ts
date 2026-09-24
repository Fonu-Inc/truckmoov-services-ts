import "reflect-metadata";
import { describe, expect, it } from "vitest";
import { DECORATORS } from "@nestjs/swagger/dist/constants";
import { OnboardingApplicationsController } from "../../../apps/auth/src/onboarding-applications.controller";
import {
  CreatedOnboardingApplicationResponse,
  M2mPlansResponse,
  OnboardingApplicationResponse,
  SubmittedOnboardingApplicationResponse,
  VerificationCodeSentResponse,
} from "../../../apps/auth/src/dto/onboarding-application-response.dto";

type Handler = keyof OnboardingApplicationsController;

function handler(name: Handler) {
  return OnboardingApplicationsController.prototype[name] as object;
}

function responses(name: Handler): Record<string, { type?: unknown }> {
  return Reflect.getMetadata(DECORATORS.API_RESPONSE, handler(name)) ?? {};
}

function headers(name: Handler): Array<{ name: string; in: string; required?: boolean }> {
  const parameters = Reflect.getMetadata(DECORATORS.API_PARAMETERS, handler(name)) ?? [];
  return parameters.filter((parameter: { in: string }) => parameter.in === "header");
}

describe("Onboarding applications OpenAPI contract", () => {
  it.each<[Handler, string, unknown]>([
    ["create", "201", CreatedOnboardingApplicationResponse],
    ["listM2mPlans", "200", M2mPlansResponse],
    ["get", "200", OnboardingApplicationResponse],
    ["update", "200", OnboardingApplicationResponse],
    ["verifyEmail", "200", OnboardingApplicationResponse],
    ["sendEmailCode", "200", VerificationCodeSentResponse],
    ["submit", "200", SubmittedOnboardingApplicationResponse],
  ])("%s documents a %s response body", (name, status, type) => {
    expect(responses(name)[status]?.type).toBe(type);
  });

  it("documents the resend cooldown body", () => {
    expect(responses("sendEmailCode")["429"]?.type).toBeDefined();
  });

  it("declares the application token header on token routes only", () => {
    expect(headers("get")).toContainEqual(
      expect.objectContaining({ name: "x-application-token", required: true }),
    );
    expect(headers("create")).toEqual([]);
  });

  it("describes the real submit gate", () => {
    const operation = Reflect.getMetadata(
      DECORATORS.API_OPERATION,
      handler("submit"),
    ) as { description: string };

    expect(operation.description).not.toMatch(/all ten documents/);
    expect(operation.description).toMatch(/indemnity/);
    expect(operation.description).toMatch(/automatedDecision/);
  });
});
