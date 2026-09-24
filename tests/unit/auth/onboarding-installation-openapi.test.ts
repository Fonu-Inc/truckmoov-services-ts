import "reflect-metadata";
import { describe, expect, it } from "vitest";
import { RequestMethod } from "@nestjs/common";
import { METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import { DECORATORS } from "@nestjs/swagger/dist/constants";
import { getSchemaPath } from "@nestjs/swagger";
import { OnboardingApplicationsController } from "../../../apps/auth/src/onboarding-applications.controller";
import { SystemOnboardingApplicationsController } from "../../../apps/auth/src/system-onboarding-applications.controller";
import { InstallationController } from "../../../apps/auth/src/installation.controller";
import { SystemInstallationOrdersController } from "../../../apps/auth/src/system-installation-orders.controller";
import {
  DuplicateIdentityErrorBody,
  OnboardingIncompleteErrorBody,
} from "../../../apps/auth/src/dto/api-error.dto";

type Documented = { type?: unknown; schema?: unknown; content?: unknown };
type Controller = { name: string; prototype: object };

const CONTROLLERS: Controller[] = [
  OnboardingApplicationsController,
  SystemOnboardingApplicationsController,
  InstallationController,
  SystemInstallationOrdersController,
];

function routes(controller: Controller): Array<[string, string, object]> {
  const prototype = controller.prototype as Record<string, unknown>;
  return Object.getOwnPropertyNames(prototype)
    .filter((name) => name !== "constructor" && typeof prototype[name] === "function")
    .filter((name) => Reflect.getMetadata(PATH_METADATA, prototype[name] as object) !== undefined)
    .map((name) => [controller.name, name, prototype[name] as object]);
}

const ROUTES = CONTROLLERS.flatMap(routes);

function responses(handler: object): Record<string, Documented> {
  return Reflect.getMetadata(DECORATORS.API_RESPONSE, handler) ?? {};
}

function hasBody(response: Documented | undefined): boolean {
  return Boolean(response?.type ?? response?.schema ?? response?.content);
}

function responseOf(controller: Controller, name: string, status: string): Documented | undefined {
  return responses((controller.prototype as Record<string, object>)[name])[status];
}

function refs(response: Documented | undefined): string[] {
  const oneOf = (response?.schema as { oneOf?: Array<{ $ref: string }> } | undefined)?.oneOf ?? [];
  return oneOf.map((entry) => entry.$ref);
}

describe("Onboarding and installation OpenAPI contract", () => {
  it("covers every route on the four controllers", () => {
    expect(ROUTES.length).toBeGreaterThanOrEqual(46);
  });

  it.each(ROUTES)("%s.%s declares its success body under the status Nest sends", (_, __, handler) => {
    const method = Reflect.getMetadata(METHOD_METADATA, handler);
    const expected = method === RequestMethod.POST ? "201" : "200";
    const success = Object.keys(responses(handler)).filter((status) => status.startsWith("2"));

    expect(success).toEqual([expected]);
    expect(hasBody(responses(handler)[expected])).toBe(true);
  });

  it.each(ROUTES)("%s.%s gives every documented error a body", (_, __, handler) => {
    const errors = Object.entries(responses(handler)).filter(([status]) => /^[45]/.test(status));

    expect(errors.some(([status]) => status.startsWith("4"))).toBe(true);
    for (const [, response] of errors) expect(hasBody(response)).toBe(true);
  });

  it.each(["importApplicationVehicles", "signIndemnityAgreement", "upload"])(
    "%s documents the multer 413",
    (name) => {
      expect(hasBody(responseOf(OnboardingApplicationsController, name, "413"))).toBe(true);
    },
  );

  it("documents the submit incomplete body", () => {
    expect(responseOf(OnboardingApplicationsController, "submit", "400")?.type).toBe(
      OnboardingIncompleteErrorBody,
    );
  });

  it.each(["create", "update", "upload"])("%s documents the duplicate identity 409", (name) => {
    expect(refs(responseOf(OnboardingApplicationsController, name, "409"))).toContain(
      getSchemaPath(DuplicateIdentityErrorBody),
    );
  });

  it("documents the IP rate limit on every applicant route", () => {
    for (const [, name] of routes(OnboardingApplicationsController)) {
      expect(hasBody(responseOf(OnboardingApplicationsController, name, "429"))).toBe(true);
    }
  });
});
