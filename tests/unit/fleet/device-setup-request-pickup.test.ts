import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { describe, expect, it } from "vitest";
import { CreateDeviceSetupRequestDto } from "../../../apps/fleet/src/dto/device-setup-request.dto";

const errorsFor = async (body: object) =>
  (await validate(plainToInstance(CreateDeviceSetupRequestDto, body))).map((e) => e.property);

describe("device setup request pickup point", () => {
  it("is required", async () => {
    expect(await errorsFor({ useCase: "Tracking" })).toContain("pickupLocationId");
    expect(await errorsFor({ useCase: "Tracking", pickupLocationId: "" })).toContain("pickupLocationId");
  });

  it("accepts a chosen pickup point", async () => {
    expect(await errorsFor({ useCase: "Tracking", pickupLocationId: "demo-1" })).toEqual([]);
  });
});
