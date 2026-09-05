import { describe, expect, it } from "vitest";
import {
  buildVehicleCsvExport,
  buildVehicleCsvTemplate,
  parseVehicleCsv,
  VehicleCsvError,
  VEHICLE_CSV_COLUMNS,
} from "../../../apps/fleet/src/contexts/fleet/vehicles/domain/vehicle-csv";

const HEADER = VEHICLE_CSV_COLUMNS.map((column) => column.header).join(",");

describe("Vehicle CSV", () => {
  it("produces a template the parser accepts", () => {
    const template = buildVehicleCsvTemplate();
    const parsed = parseVehicleCsv(template);

    expect(parsed.errors).toEqual([]);
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0].registrationNumber).toBe("LAG-234-XY");
    expect(parsed.rows[0].model).toBe("Actros");
  });

  // The export is the tenant's own data coming back out; if it cannot be
  // re-imported without hand editing, the two formats have drifted.
  it("round trips an export back through the parser", () => {
    const exported = buildVehicleCsvExport([
      {
        registrationNumber: "LAG-234-XY",
        vin: "WDB9634031L123456",
        make: "Mercedes-Benz",
        model: "Actros",
        year: 2022,
        type: "truck",
        fuelType: "diesel",
        capacity: 30,
        capacityUnit: "tons",
        status: "active",
      },
    ]);

    const parsed = parseVehicleCsv(exported);
    expect(parsed.errors).toEqual([]);
    expect(parsed.rows[0]).toEqual({
      registrationNumber: "LAG-234-XY",
      vin: "WDB9634031L123456",
      make: "Mercedes-Benz",
      model: "Actros",
      year: 2022,
      type: "truck",
      fuelType: "diesel",
      capacity: 30,
      capacityUnit: "tons",
      status: "active",
    });
  });

  it("keeps good rows and reports the bad ones by line", () => {
    const csv = [
      HEADER,
      "LAG-001-AA,,Volvo,FH16,2023,truck,diesel,40,tons,active",
      ",,MAN,TGX,2021,truck,diesel,35,tons,active",
      "LAG-003-CC,,Scania,R450,2023,spaceship,diesel,30,tons,active",
      "LAG-004-DD,,DAF,XF,2022,truck,diesel,28,tons,active",
    ].join("\n");

    const parsed = parseVehicleCsv(csv);

    expect(parsed.rows.map((row) => row.registrationNumber)).toEqual(["LAG-001-AA", "LAG-004-DD"]);
    expect(parsed.errors).toEqual([
      { line: 3, message: "registration_number is required" },
      { line: 4, message: "type must be one of: truck, van, trailer" },
    ]);
  });

  it("rejects a file missing a required column", () => {
    expect(() => parseVehicleCsv("make,model\nVolvo,FH16")).toThrow(VehicleCsvError);
    expect(() => parseVehicleCsv("make,model\nVolvo,FH16")).toThrow(/registration_number/);
  });

  it("rejects an empty file", () => {
    expect(() => parseVehicleCsv("   \n\n")).toThrow(/empty/);
  });

  it("tolerates quoted values, spacing and header casing", () => {
    const csv = [
      "Registration_Number, VIN ,Make,Model,Year,Type,Fuel_Type,Capacity,Capacity_Unit,Status",
      '"LAG-005-EE",,"Iveco, S-Way",Stralis,2020,van,petrol,12,m3,inactive',
    ].join("\n");

    const parsed = parseVehicleCsv(csv);
    expect(parsed.errors).toEqual([]);
    expect(parsed.rows[0].make).toBe("Iveco, S-Way");
    expect(parsed.rows[0].status).toBe("inactive");
  });

  it("rejects a VIN that is not 17 characters", () => {
    const csv = [HEADER, "LAG-006-FF,SHORTVIN,Volvo,FH16,2023,truck,diesel,40,tons,active"].join("\n");
    const parsed = parseVehicleCsv(csv);

    expect(parsed.rows).toHaveLength(0);
    expect(parsed.errors[0].message).toMatch(/17 characters/);
  });

  // A make of "=cmd|' /c calc'!A1" must not run when the export is opened in a
  // spreadsheet, and must still import back as the value that was stored.
  it("neutralises spreadsheet formulas on export and restores them on import", () => {
    const exported = buildVehicleCsvExport([
      {
        registrationNumber: "LAG-007-GG",
        vin: null,
        make: "=cmd|' /c calc'!A1",
        model: "+SUM(A1:A9)",
        year: 2024,
        type: "truck",
        fuelType: "diesel",
        capacity: 20,
        capacityUnit: "tons",
        status: "active",
      },
    ]);

    const lines = exported.split("\n");
    expect(lines[1]).toContain("'=cmd");
    expect(lines[1]).toContain("'+SUM(A1:A9)");
    expect(lines[1]).not.toMatch(/,=cmd/);
    expect(lines[1]).not.toMatch(/,\+SUM/);

    const parsed = parseVehicleCsv(exported);
    expect(parsed.errors).toEqual([]);
    expect(parsed.rows[0].make).toBe("=cmd|' /c calc'!A1");
    expect(parsed.rows[0].model).toBe("+SUM(A1:A9)");
  });
});
