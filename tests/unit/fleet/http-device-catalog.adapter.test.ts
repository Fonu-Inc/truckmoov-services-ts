import { afterEach, describe, expect, it, vi } from "vitest";
import axios from "axios";
import { HttpDeviceCatalogAdapter } from "../../../apps/fleet/src/contexts/fleet/devices/infrastructure/http-device-catalog.adapter";

const config = {
  auth: { serviceUrl: "http://auth", jwtSecret: "secret" },
  fleet: { deviceCatalogCacheSeconds: 300, defaultTenant: "default" },
  serviceAuth: { secret: "secret" },
} as never;

function adapter() {
  const instance = new HttpDeviceCatalogAdapter(config);
  Object.assign(instance, { caller: { headers: () => ({ authorization: "Bearer svc" }) } });
  return instance;
}

const model = { manufacturer: "Teltonika", model: "FMC150", protocolType: "TCP", status: "supported", defaultPort: 5027 };

afterEach(() => vi.restoreAllMocks());

describe("device catalogue cache", () => {
  // Each replica caches its own copy; one that cached an empty catalogue kept
  // answering "no manufacturers" for minutes after models were added.
  it("asks again after an empty catalogue instead of caching it", async () => {
    const get = vi
      .spyOn(axios, "get")
      .mockResolvedValueOnce({ status: 200, data: { data: { models: [] } } })
      .mockResolvedValueOnce({ status: 200, data: { data: { models: [model] } } });
    const catalog = adapter();

    expect(await catalog.findAll()).toEqual([]);
    expect((await catalog.findAll()).map((m) => m.model)).toEqual(["FMC150"]);
    expect(get).toHaveBeenCalledTimes(2);
  });

  it("still caches a catalogue that has models", async () => {
    const get = vi.spyOn(axios, "get").mockResolvedValue({ status: 200, data: { data: { models: [model] } } });
    const catalog = adapter();

    await catalog.findAll();
    await catalog.findAll();
    expect(get).toHaveBeenCalledTimes(1);
  });
});
