import { NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { OWNER_OPERATOR_ORGANISATION_TYPE, Role } from "@shared/rbac";
import { MaintenanceController } from "../../../apps/fleet/src/maintenance.controller";
import { GeofencesController } from "../../../apps/fleet/src/geofences.controller";
import { GeofenceZoneNotFoundError } from "../../../apps/fleet/src/geofence-zones.use-case";
import { MaintenanceRecordsUseCase } from "../../../apps/fleet/src/maintenance-records.use-case";
import { MaintenanceProfilesUseCase } from "../../../apps/fleet/src/maintenance-profiles.use-case";
import type { StoredMaintenanceRecord } from "../../../apps/fleet/src/maintenance-record.repository";
import type { StoredMaintenanceProfile } from "../../../apps/fleet/src/maintenance-profile.repository";

const request = (userId: string, role: Role, organizationType?: string) =>
  ({ user: { tenantId: "t1", userId, role, organizationType } }) as never;

// Two independent operators on one enterprise account, plus the enterprise's own truck.
const opOne = request("op-1", Role.OWNER_OPERATOR, "enterprise");
const opTwo = request("op-2", Role.OWNER_OPERATOR, "enterprise");
const admin = request("adm", Role.ENTERPRISE_ADMIN);
const founder = request("op-1", Role.OWNER_OPERATOR, OWNER_OPERATOR_ORGANISATION_TYPE);

const vehicles = [
  { id: "v1", plate: "OP1-PLATE", ownerOperatorId: "op-1" },
  { id: "v2", plate: "OP2-PLATE", ownerOperatorId: "op-2" },
  { id: "v3", plate: "ENT-PLATE", ownerOperatorId: null },
];

const asEntity = (vehicle: (typeof vehicles)[number]) => ({
  id: vehicle.id,
  toPrimitives: () => ({ id: vehicle.id, plateNumber: vehicle.plate, registrationNumber: vehicle.plate }),
});

const vehicleRepository = {
  findAllByOwnerOperatorId: vi.fn(async (ownerOperatorId: string) =>
    vehicles.filter((vehicle) => vehicle.ownerOperatorId === ownerOperatorId).map(asEntity),
  ),
  findById: vi.fn(async (id: string) => {
    const vehicle = vehicles.find((v) => v.id === id);
    return vehicle ? asEntity(vehicle) : null;
  }),
  findByPlateNumber: vi.fn(async (plate: string) => {
    const vehicle = vehicles.find((v) => v.plate === plate);
    return vehicle ? asEntity(vehicle) : null;
  }),
};

const maintenanceRecord = (vehicleId: string, cost: number): StoredMaintenanceRecord => ({
  id: `r-${vehicleId}`, tenantId: "t1", vehicleId, maintenanceType: "oil", status: "scheduled", priority: "low",
  currency: "NGN", description: null, scheduledDate: "2099-01-01", completedDate: null, cost, technician: null,
  notes: null, createdAt: new Date(), updatedAt: new Date(),
});

const maintenanceProfile = (vehicleId: string): StoredMaintenanceProfile => ({
  id: `p-${vehicleId}`, tenantId: "t1", vehicleId, serviceType: "oil", serviceLabel: "Oil", intervalType: "date",
  intervalDays: 30, intervalMonths: null, intervalKm: null, lastServiceDate: null, lastServiceMileage: null,
  currentMileage: null, mileageSource: "manual", nextDueDate: "2099-01-01", nextDueMileage: null,
  createdAt: new Date(), updatedAt: new Date(),
});

function store<T extends { id: string }>(rows: T[]) {
  const byId = new Map(rows.map((row) => [row.id, row]));
  return {
    save: vi.fn(async (row: T) => void byId.set(row.id, row)),
    findById: vi.fn(async (id: string) => byId.get(id) ?? null),
    findAllByTenant: vi.fn(async () => [...byId.values()]),
    deleteById: vi.fn(async (id: string) => void byId.delete(id)),
  };
}

function maintenance() {
  const records = store(["v1", "v2", "v3"].map((id, i) => maintenanceRecord(id, (i + 1) * 100)));
  const profiles = store(["v1", "v2", "v3"].map(maintenanceProfile));
  const reminderSchedules = {
    findByTenantId: vi.fn(async () => ({ id: "s1", tenantId: "t1", recipientEmail: "boss@ent.ng", leadDays: 7, enabled: true,
      lastRunAt: null, lastSentCount: null, createdBy: "adm", createdAt: new Date(), updatedAt: new Date() })),
    save: vi.fn(async () => {}),
    deleteByTenantId: vi.fn(async () => {}),
  };
  const reminderService = { runForTenant: vi.fn(async () => []), findDue: vi.fn(async () => []) };
  const controller = Object.assign(Object.create(MaintenanceController.prototype), {
    vehicleRepository,
    maintenanceRecordsUseCase: new MaintenanceRecordsUseCase(records as never, vehicleRepository as never),
    maintenanceProfilesUseCase: new MaintenanceProfilesUseCase(profiles as never),
    reminderSchedules,
    reminderService,
    auditLog: { record: vi.fn() },
    bus: { publish: vi.fn() },
  }) as MaintenanceController;
  return { controller, records, profiles, reminderSchedules, reminderService };
}

const vehicleIdsOf = (result: unknown) => (result as { data: Array<{ vehicleId: string }> }).data.map((row) => row.vehicleId);

async function exported(run: (res: unknown) => Promise<unknown>) {
  let body = "";
  await run({ setHeader: vi.fn(), send: (text: string) => (body = text) });
  return body;
}

describe("an owner operator's maintenance records", () => {
  const list = (req: never) => maintenance().controller.listMaintenanceRecords("", "", "", "", "", req);

  it("shows each owner operator only their own vehicles' records", async () => {
    expect(vehicleIdsOf(await list(opOne))).toEqual(["v1"]);
    expect(vehicleIdsOf(await list(opTwo))).toEqual(["v2"]);
  });

  it("shows an admin, and the founder of an owner-operator organisation, everything", async () => {
    expect(vehicleIdsOf(await list(admin))).toEqual(["v1", "v2", "v3"]);
    expect(vehicleIdsOf(await list(founder))).toEqual(["v1", "v2", "v3"]);
  });

  it("totals the summary and the export over their own vehicles only", async () => {
    const { controller } = maintenance();
    const summary = (await controller.getMaintenanceRecordsSummary(opOne)) as { data: { total: number; totalCostNgn: number } };
    const csv = await exported((res) => controller.exportMaintenanceRecords(opOne, res));

    expect(summary.data).toMatchObject({ total: 1, totalCostNgn: 100 });
    expect(csv).toContain("r-v1");
    expect(csv).not.toContain("r-v2");
  });

  it("reads, changes and deletes another owner's record as not found", async () => {
    const { controller, records } = maintenance();
    const refusals = [
      controller.getMaintenanceRecord("r-v2", opOne),
      controller.updateMaintenanceRecord("r-v2", { notes: "x" } as never, opOne),
      controller.deleteMaintenanceRecord("r-v2", opOne),
      controller.startMaintenanceRecord("r-v2", opOne),
      controller.completeMaintenanceRecord("r-v3", opOne),
    ];

    for (const refusal of refusals) {
      await expect(refusal).rejects.toThrow(new NotFoundException("Maintenance record not found"));
    }
    expect(records.save).not.toHaveBeenCalled();
    expect(records.deleteById).not.toHaveBeenCalled();
  });

  it("refuses a record against, or moved to, another owner's vehicle as an unknown vehicle", async () => {
    const { controller, records } = maintenance();
    const body = { vehicleId: "OP2-PLATE", maintenanceType: "oil", priority: "low" } as never;

    await expect(controller.createMaintenanceRecord(body, opOne)).rejects.toBeInstanceOf(NotFoundException);
    await expect(controller.updateMaintenanceRecord("r-v1", { vehicleId: "v2" } as never, opOne)).rejects.toBeInstanceOf(NotFoundException);
    expect(records.save).not.toHaveBeenCalled();
  });

  it("lets them schedule work on their own vehicle by plate", async () => {
    const { controller } = maintenance();
    const body = { vehicleId: "OP1-PLATE", maintenanceType: "oil", priority: "low" } as never;

    const created = (await controller.createMaintenanceRecord(body, opOne)) as { data: { vehicleId: string } };

    expect(created.data.vehicleId).toBe("v1");
  });

  it("gives an admin any record", async () => {
    const result = (await maintenance().controller.getMaintenanceRecord("r-v2", admin)) as { data: { id: string } };

    expect(result.data.id).toBe("r-v2");
  });
});

describe("an owner operator's maintenance profiles", () => {
  const list = (req: never) => maintenance().controller.listMaintenanceProfiles("", "", "", "", "", "", req);

  it("shows each owner operator only their own vehicles' profiles, and an admin all", async () => {
    expect(vehicleIdsOf(await list(opOne))).toEqual(["v1"]);
    expect(vehicleIdsOf(await list(opTwo))).toEqual(["v2"]);
    expect(vehicleIdsOf(await list(admin))).toEqual(["v1", "v2", "v3"]);
  });

  it("counts and exports their own vehicles only", async () => {
    const { controller } = maintenance();
    const summary = (await controller.getMaintenanceProfilesSummary(opOne)) as { data: { total: number } };
    const csv = await exported((res) => controller.exportMaintenanceProfiles(opOne, res));

    expect(summary.data.total).toBe(1);
    expect(csv).toContain("p-v1");
    expect(csv).not.toContain("p-v2");
  });

  it("deletes and completes another owner's profile as not found", async () => {
    const { controller, profiles } = maintenance();

    await expect(controller.deleteMaintenanceProfile("p-v2", opOne)).rejects.toThrow(new NotFoundException("Maintenance profile not found"));
    await expect(controller.completeMaintenanceProfile("p-v3", opOne)).rejects.toThrow(new NotFoundException("Maintenance profile not found"));
    expect(profiles.deleteById).not.toHaveBeenCalled();
    expect(profiles.save).not.toHaveBeenCalled();
  });

  it("refuses a profile on another owner's vehicle, but not for an admin", async () => {
    const { controller, profiles } = maintenance();
    const body = { vehicleId: "v2", serviceType: "oil", serviceLabel: "Oil", intervalType: "date", mileageSource: "manual" } as never;

    await expect(controller.createMaintenanceProfile(body, opOne)).rejects.toThrow(new NotFoundException("Vehicle not found"));
    await controller.createMaintenanceProfile(body, admin);
    expect(profiles.save).toHaveBeenCalledTimes(1);
  });
});

describe("the account's maintenance reminder for an owner operator", () => {
  it("is not shown to them, and is to an admin", async () => {
    const { controller, reminderSchedules } = maintenance();

    const theirs = (await controller.getReminderSchedule(opOne)) as { data: { schedule: unknown } };
    expect(theirs.data.schedule).toBeNull();
    expect(reminderSchedules.findByTenantId).not.toHaveBeenCalled();

    const admins = (await controller.getReminderSchedule(admin)) as { data: { schedule: { recipientEmail: string } } };
    expect(admins.data.schedule.recipientEmail).toBe("boss@ent.ng");
  });

  it("cannot be set, stopped or run by them", async () => {
    const { controller, reminderSchedules, reminderService } = maintenance();
    const refused = new NotFoundException("Reminder schedule not found");

    await expect(controller.saveReminderSchedule({ recipientEmail: "me@op.ng", leadDays: 7 } as never, opOne)).rejects.toThrow(refused);
    await expect(controller.deleteReminderSchedule(opOne)).rejects.toThrow(refused);
    await expect(controller.sendMaintenanceReminders(opOne)).rejects.toThrow(refused);
    expect(reminderSchedules.save).not.toHaveBeenCalled();
    expect(reminderSchedules.deleteByTenantId).not.toHaveBeenCalled();
    expect(reminderService.runForTenant).not.toHaveBeenCalled();
  });

  it("can still be run by an admin", async () => {
    const { controller, reminderService } = maintenance();

    await controller.sendMaintenanceReminders(admin);

    expect(reminderService.runForTenant).toHaveBeenCalledTimes(1);
  });
});

describe("shared geofence zones for an owner operator", () => {
  const zone = { id: "z1", tenantId: "t1", name: "Depot", assignedVehicleIds: ["v1", "v2", "v3"] };
  const occupant = (vehicleId: string) => ({ id: `o-${vehicleId}`, tenantId: "t1", vehicleId, zoneId: "z1", enteredAt: new Date(0) });

  function geofences() {
    const zones = {
      list: vi.fn(async () => [zone]),
      get: vi.fn(async (_tenantId: string, id: string) => {
        if (id !== "z1") throw new GeofenceZoneNotFoundError();
        return zone;
      }),
      create: vi.fn(async () => zone),
      update: vi.fn(async () => zone),
      delete: vi.fn(async () => {}),
      setVehicleAssignments: vi.fn(async (_t: string, _id: string, vehicleIds: string[]) => ({ ...zone, assignedVehicleIds: vehicleIds })),
    };
    const evaluator = {
      occupantCounts: vi.fn(async () => new Map([["z1", 2]])),
      occupants: vi.fn(async () => [occupant("v1"), occupant("v2")]),
    };
    const controller = Object.assign(Object.create(GeofencesController.prototype), {
      vehicleRepository,
      geofenceZonesUseCase: zones,
      geofenceEvaluator: evaluator,
    }) as GeofencesController;
    return { controller, zones };
  }

  type ZoneView = { assignedVehicleIds: string[]; vehiclesInside: number; occupants?: Array<{ vehicleId: string }> };

  it("lists the zones with only their own vehicles assigned and inside", async () => {
    const one = (await geofences().controller.listGeofenceZones("", opOne)) as { data: ZoneView[] };
    const two = (await geofences().controller.listGeofenceZones("", opTwo)) as { data: ZoneView[] };

    expect(one.data[0]).toMatchObject({ assignedVehicleIds: ["v1"], vehiclesInside: 1 });
    expect(two.data[0]).toMatchObject({ assignedVehicleIds: ["v2"], vehiclesInside: 1 });
  });

  it("lists every assignment and occupant to an admin", async () => {
    const result = (await geofences().controller.listGeofenceZones("", admin)) as { data: ZoneView[] };

    expect(result.data[0]).toMatchObject({ assignedVehicleIds: ["v1", "v2", "v3"], vehiclesInside: 2 });
  });

  it("shows only their own occupants on one zone", async () => {
    const result = (await geofences().controller.getGeofenceZone("z1", opOne)) as { data: ZoneView };

    expect(result.data.occupants?.map((o) => o.vehicleId)).toEqual(["v1"]);
    expect(result.data.vehiclesInside).toBe(1);
  });

  it("assigns their own vehicles without dropping anyone else's", async () => {
    const { controller, zones } = geofences();

    const result = (await controller.setGeofenceVehicleAssignments("z1", { vehicleIds: [] }, opOne)) as { data: ZoneView };

    expect(zones.setVehicleAssignments).toHaveBeenCalledWith("t1", "z1", ["v2", "v3"]);
    expect(result.data.assignedVehicleIds).toEqual([]);
  });

  it("refuses assigning another owner's vehicle as not found", async () => {
    const { controller, zones } = geofences();

    await expect(controller.setGeofenceVehicleAssignments("z1", { vehicleIds: ["v1", "v2"] }, opOne)).rejects.toThrow(
      new NotFoundException("Vehicle not found"),
    );
    expect(zones.setVehicleAssignments).not.toHaveBeenCalled();
  });

  it("lets an admin replace the assignments outright", async () => {
    const { controller, zones } = geofences();

    await controller.setGeofenceVehicleAssignments("z1", { vehicleIds: ["v2"] }, admin);

    expect(zones.setVehicleAssignments).toHaveBeenCalledWith("t1", "z1", ["v2"]);
  });

  it("refuses creating, editing or archiving a shared zone as not found", async () => {
    const { controller, zones } = geofences();
    const refused = new NotFoundException("Geofence zone not found");

    await expect(controller.createGeofenceZone({} as never, opOne)).rejects.toThrow(refused);
    await expect(controller.updateGeofenceZone("z1", {} as never, opOne)).rejects.toThrow(refused);
    await expect(controller.deleteGeofenceZone("z1", opOne)).rejects.toThrow(refused);
    expect(zones.create).not.toHaveBeenCalled();
    expect(zones.update).not.toHaveBeenCalled();
    expect(zones.delete).not.toHaveBeenCalled();
  });

  it("still lets an admin and an owner-operator organisation's founder edit a zone", async () => {
    const { controller, zones } = geofences();

    await controller.updateGeofenceZone("z1", {} as never, admin);
    await controller.updateGeofenceZone("z1", {} as never, founder);

    expect(zones.update).toHaveBeenCalledTimes(2);
  });
});
