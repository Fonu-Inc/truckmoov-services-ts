import { beforeEach, describe, expect, it, vi } from "vitest";
import axios from "axios";
import { HttpBundleCatalogReader } from "../../../apps/fleet/src/contexts/fleet/carriers";

vi.mock("axios");

const SECRET = "shared-platform-secret";

function buildReader() {
  const config = {
    auth: { serviceUrl: "http://auth:3001", jwtSecret: SECRET },
    identity: { legacySecret: SECRET, serviceTokenDir: "/nonexistent", serviceAuthDevSecret: "dev-secret" },
  };
  return new HttpBundleCatalogReader(config as never);
}

const authBody = {
  status: true,
  data: {
    carriers: [{ id: "car-mtn", name: "MTN", displayName: "MTN Nigeria", active: true }],
    bundles: [{
      id: "b-mtn-500mb", code: "MTN-500MB", name: "MTN 500MB", carrierId: "car-mtn", dataAmountGb: 0.5,
      validityDays: 30, billingCycle: "monthly", priceKobo: 75050, currency: "NGN", active: true,
    }],
  },
};

describe("HttpBundleCatalogReader", () => {
  beforeEach(() => {
    vi.mocked(axios.get).mockReset();
  });

  it("reads auth's internal catalogue and maps it to fleet's shape", async () => {
    vi.mocked(axios.get).mockResolvedValue({ status: 200, data: authBody });

    const catalog = await buildReader().read();

    expect(vi.mocked(axios.get).mock.calls[0][0]).toBe("http://auth:3001/auth/internal/bundle-catalog");
    expect(catalog).toEqual({
      carriers: [{ id: "car-mtn", name: "MTN Nigeria", code: "MTN", status: "active" }],
      bundles: [{
        id: "b-mtn-500mb", carrierId: "car-mtn", name: "MTN 500MB", planType: "monthly",
        dataAllowanceMb: 512, priceNgn: 750.5, status: "active",
      }],
    });
  });

  it.each([
    ["a refusal", { status: 401, data: { message: "Invalid service token" } }],
    ["an unusable body", { status: 200, data: { status: true, data: "boom" } }],
  ])("is null on %s", async (_, response) => {
    vi.mocked(axios.get).mockResolvedValue(response);
    expect(await buildReader().read()).toBeNull();
  });

  it("is null when auth cannot be reached", async () => {
    vi.mocked(axios.get).mockRejectedValue(new Error("connect ECONNREFUSED"));
    expect(await buildReader().read()).toBeNull();
  });
});
