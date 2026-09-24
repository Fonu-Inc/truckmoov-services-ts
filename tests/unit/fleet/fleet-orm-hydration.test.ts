import { afterAll, describe, expect, it } from "vitest";
import { MikroORM } from "@mikro-orm/postgresql";
import {
  FleetFinancialConfigRecord,
  FleetFinancialConfigRecordSchema,
  FleetFuelRecordRecord,
  FleetFuelRecordRecordSchema,
  MaintenanceRecordOrmRecord,
  MaintenanceRecordOrmSchema,
} from "../../../apps/fleet/src/contexts/fleet/shared/infrastructure/persistence/fleet-orm";

const orm = MikroORM.initSync({
  entities: [FleetFinancialConfigRecordSchema, FleetFuelRecordRecordSchema, MaintenanceRecordOrmSchema],
  dbName: "unused",
  connect: false,
  allowGlobalContext: true,
});

afterAll(() => orm.close());

describe("fleet ORM decimal hydration", () => {
  it("hydrates financial config money columns as numbers", () => {
    const cfg = orm.em.map(FleetFinancialConfigRecord, {
      id: "c1",
      tenant_id: "t1",
      vehicle_id: "v1",
      monthly_wages_ngn: "150000.00",
      monthly_driver_wage_ngn: "90000.50",
      asset_purchase_price_ngn: null,
      created_at: new Date(),
      updated_at: new Date(),
    } as never);

    expect(cfg.monthlyWagesNgn).toBe(150000);
    expect(cfg.monthlyDriverWageNgn).toBe(90000.5);
    expect(cfg.assetPurchasePriceNgn).toBeNull();
  });

  it("hydrates fuel record quantities as numbers", () => {
    const row = orm.em.map(FleetFuelRecordRecord, {
      id: "f1",
      tenant_id: "t1",
      vehicle_id: "v1",
      liters: "40.500",
      price_per_liter: "1000.00",
      total_cost: "40500.00",
      odometer: null,
      recorded_at: new Date("2026-09-24T10:00:00.000Z"),
      recorded_by: "u1",
      audit_trail: [],
      created_at: new Date(),
      updated_at: new Date(),
    } as never);

    expect(row.liters).toBe(40.5);
    expect(row.totalCost).toBe(40500);
    expect(row.odometer).toBeNull();
  });

  it("hydrates maintenance cost as a number", () => {
    const row = orm.em.map(MaintenanceRecordOrmRecord, {
      id: "m1",
      tenant_id: "t1",
      vehicle_id: "v1",
      maintenance_type: "service",
      status: "completed",
      priority: "medium",
      cost: "150.00",
      currency: "NGN",
      created_at: new Date(),
      updated_at: new Date(),
    } as never);

    expect(row.cost).toBe(150);
  });
});
