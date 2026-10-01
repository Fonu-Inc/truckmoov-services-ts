import "reflect-metadata";
import { describe, expect, it } from "vitest";
import { DECORATORS } from "@nestjs/swagger/dist/constants";
import { toErrorBody } from "@shared/openapi";
import { DriversController } from "../../../apps/fleet/src/drivers.controller";
import { DriverFatigueUseCase } from "../../../apps/fleet/src/contexts/fleet/drivers/application/use-cases/driver-fatigue.use-case";
import { FeatureDisabledErrorResponse } from "../../../apps/fleet/src/dto/fleet.schema";

type Documented = { type?: unknown };

function responses(name: keyof DriversController): Record<string, Documented> {
  return Reflect.getMetadata(DECORATORS.API_RESPONSE, DriversController.prototype[name]) ?? {};
}

const FATIGUE_ROUTES = [
  ["getFatigueSummary", "200"],
  ["getDriverFatigue", "200"],
  ["runFatigueAnalysis", "201"],
] as const;

describe("Driver behaviour and fatigue OpenAPI", () => {
  it.each([
    ["getBehaviorSummary", "200"],
    ["getBehaviorRanking", "200"],
    ["getBehaviorEvents", "200"],
    ["recordBehaviorEvent", "201"],
    ["deleteBehaviorEvent", "200"],
    ["getGeofenceAlerts", "200"],
    ["markGeofenceAlertsRead", "200"],
    ["getDriverBehavior", "200"],
    ...FATIGUE_ROUTES,
  ] as const)("%s documents a typed %s body", (name, status) => {
    expect(responses(name)[status]?.type).toBeTruthy();
  });

  it("documents the 404 on delete", () => {
    expect(responses("deleteBehaviorEvent")["404"]?.type).toBeTruthy();
  });

  it.each(FATIGUE_ROUTES)("%s documents the feature-disabled 503", (name) => {
    expect(responses(name)["503"]?.type).toBe(FeatureDisabledErrorResponse);
  });

  it("documents the 503 body the error filter actually writes", async () => {
    const disabled = new DriverFatigueUseCase({} as never, {} as never, {} as never, {
      drivers: { fatigueEnabled: false },
    } as never);
    const thrown = await disabled.summary("t1").catch((error: unknown) => error);

    expect(toErrorBody(thrown)).toEqual({
      status: false,
      message: "Fatigue detection is not enabled for this deployment",
      error: "Service Unavailable",
      statusCode: 503,
      feature: "driver_fatigue",
    });
  });
});
