import { describe, expect, it } from "vitest";
import { DeviceCatalogLookupUseCase } from "../../../apps/fleet/src/contexts/fleet/devices/application/use-cases/device-catalog-lookup.use-case";
import type {
  DeviceCatalogModel,
  DeviceCatalogPort,
} from "../../../apps/fleet/src/contexts/fleet/devices/domain/ports/device-catalog.port";

function model(manufacturer: string, name: string, status = "supported"): DeviceCatalogModel {
  return {
    manufacturer,
    model: name,
    deviceType: null,
    protocol: "TCP",
    defaultPort: 5027,
    status,
    configurationInstructions: null,
    smsCommands: [],
    wiringNotes: null,
    diagramUrls: [],
  };
}

function lookup(models: DeviceCatalogModel[]) {
  const catalog: DeviceCatalogPort = {
    findAll: async () => models,
    findModel: async () => null,
  };
  return new DeviceCatalogLookupUseCase(catalog);
}

describe("device catalog manufacturers", () => {
  it("lists manufacturers with a supported model, sorted", async () => {
    const result = await lookup([
      model("Teltonika", "FMC130"),
      model("Queclink", "GV300"),
      model("Meitrack", "T366", "deprecated"),
    ]).manufacturers();

    expect(result).toEqual({ manufacturers: ["Queclink", "Teltonika"] });
  });

  // A manufacturer with no catalogued model has no protocol, so a device
  // registered under it could never be configured.
  it("adds no built-in defaults the catalog does not carry", async () => {
    expect(await lookup([]).manufacturers()).toEqual({ manufacturers: [] });
    expect(await lookup([model("Teltonika", "FMC130")]).manufacturers()).toEqual({ manufacturers: ["Teltonika"] });
  });
});
