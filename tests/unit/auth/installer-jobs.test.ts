import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  INSTALLATION_ORDER_STATUSES,
  INSTALLATION_ORDER_TRANSITIONS,
  InMemoryInstallationJobReader,
  InMemoryInstallationOrderRepository,
  InMemoryInstallerRepository,
  InstallationJobClosedError,
  InstallationJobNotFoundError,
  InstallerAssignmentService,
  InstallerDeviceScopeUseCase,
  InstallerJobsUseCases,
  InstallerProfileUseCases,
  InvalidInstallationTransitionError,
  InvalidInstallerPhotoError,
  DeviceAlreadyBoundError,
  FleetDeviceRefusedError,
  FleetUnavailableError,
  ManageInstallationOrdersUseCases,
  SweepInstallationOrdersUseCase,
  assertTransition,
  buildOrderNumber,
  type StoredInstaller,
} from "@auth/installation";
import {
  assignOrder,
  bookingDay,
  canTransition,
  transitionOrder,
  type InstallationOrderStatus,
} from "@auth/installation/domain/installation-order";
import type { StoredInstallationOrder } from "@auth/installation/domain/installation-order.repository";
import type { JobDevice } from "@auth/installation/domain/ports/job-device-lookup.port";
import { lagosDate, lagosToday } from "@shared/devices";
import { InMemoryOnboardingApplicationRepository } from "@auth/onboarding/infrastructure/persistence/in-memory-onboarding-application.repository";
import type { StoredOnboardingApplication } from "@auth/onboarding/domain/onboarding-application.repository";
import { OnboardingValidationError } from "@auth/onboarding/domain/onboarding-application.validation";
import { InMemoryUserRepository } from "../../../apps/auth/src/contexts/auth/session/infrastructure/in-memory-user.repository";
import { InMemorySimRepository } from "../../../apps/auth/src/in-memory-sim.repository";
import { AccessResolver } from "../../../apps/auth/src/access-resolver";
import { InMemoryTenantRoleRepository } from "../../../apps/auth/src/in-memory-tenant-role.repository";
import { InMemoryPermissionRemovalRepository } from "../../../apps/auth/src/in-memory-permission-removal.repository";
import { Migration20260924020000 } from "../../../apps/auth/src/migrations/Migration20260924020000";
import { InternalInstallersController } from "../../../apps/auth/src/internal-installers.controller";

const NOW = new Date("2026-09-24T10:00:00Z");
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]);

function day(date: string): Date {
  return new Date(`${date}T00:00:00Z`);
}

function installer(id: string, overrides: Partial<StoredInstaller> = {}): StoredInstaller {
  return {
    id,
    userId: `user-${id}`,
    code: `INS-${id}`,
    firstName: id,
    lastName: "Installer",
    fullName: `${id} Installer`,
    email: `${id}@fieldops.ng`,
    phoneNumber: "+2348031234567",
    team: "",
    state: "Lagos",
    city: "Ikeja",
    serviceAreas: ["Lagos"],
    capabilities: ["device_installation"],
    photoKey: null,
    notificationPreferences: null,
    status: "active",
    maxActiveJobs: 3,
    lastActivityAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function order(id: string, overrides: Partial<StoredInstallationOrder> = {}): StoredInstallationOrder {
  return {
    id,
    orderNumber: `FL-${id}`,
    applicationId: `app-${id}`,
    tenantId: `tenant-${id}`,
    scheduledDate: day("2026-09-24"),
    timeSlot: "morning",
    addressLine: "14 Kudirat Abiola Way",
    city: "Ikeja",
    state: "Lagos",
    siteContactName: "Ada",
    siteContactPhone: "+2347014452219",
    notes: null,
    installerId: null,
    status: "unassigned",
    preExceptionStatus: null,
    assignedAt: null,
    acceptedAt: null,
    startedAt: null,
    completedAt: null,
    cancelledAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function application(id: string, organizationName: string): StoredOnboardingApplication {
  return {
    id: `app-${id}`,
    reference: `APP-${id}`,
    tokenHash: "hash",
    applicantType: "fleet_provider",
    organizationName,
    businessEmail: `ops@${id}.ng`,
    organizationPhone: "+2348000000000",
    contactFullName: "Jane Doe",
    contactRole: null,
    streetAddress: "Street",
    city: "Ikeja",
    state: "Lagos",
    rcNumber: null,
    taxIdentificationNumber: null,
    identificationType: null,
    identificationNumber: null,
    m2mPlanCode: null,
    billingEmail: null,
    billingEmailVerifiedAt: null,
    stage: "installation",
    emailVerifiedAt: NOW,
    phoneVerifiedAt: NOW,
    status: "approved",
    submittedAt: NOW,
    reviewedBy: null,
    reviewedAt: null,
    decisionReason: null,
    tenantId: `tenant-${id}`,
    setupLinkStatus: null,
    setupLinkSentAt: null,
    setupLinkError: null,
    setupLinkAttempts: 0,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function device(id: string): JobDevice {
  return { id, name: null, imei: "356938035643809", manufacturer: "Teltonika", model: "FMB920", status: "configured", statusLabel: "Configured", deviceType: null };
}

async function harness() {
  const installers = new InMemoryInstallerRepository();
  const orders = new InMemoryInstallationOrderRepository();
  const applications = new InMemoryOnboardingApplicationRepository();
  const reader = new InMemoryInstallationJobReader(orders, applications, installers);
  const sims = new InMemorySimRepository();
  const fleet = new Map<string, JobDevice[]>();
  const lookup = {
    down: false,
    forTenant: vi.fn(async (tenantId: string, ids: string[]) =>
      lookup.down ? null : new Map((fleet.get(tenantId) ?? []).filter((d) => ids.includes(d.id)).map((d) => [d.id, d])),
    ),
  };
  const tokens = { resolveAccessToken: (token: string) => ({ id: token, email: `${token}@co.com`, role: "INSTALLER", tenantId: "system" }) };
  const jobs = new InstallerJobsUseCases(tokens as never, installers, orders, reader, applications, lookup, sims);

  async function job(id: string, name: string, overrides: Partial<StoredInstallationOrder>, fleetDeviceId: string | null = null) {
    await applications.save(application(id, name));
    await applications.saveVehicle({
      id: `veh-${id}`, applicationId: `app-${id}`, registrationNumber: `LSD-${id}-XA`, vehicleType: "truck", make: "Mercedes-Benz",
      model: "Actros 1844", year: 2021, engineNumber: "OM471", chassisNumber: "WDB96", color: "White", engineCapacity: "12.8L",
      odometerReading: 148220, purchaseType: null, purchaseTypeOther: null, createdAt: NOW, updatedAt: NOW,
    });
    await orders.save(order(id, overrides));
    await orders.replaceAssignments(id, [
      { id: `unit-${id}`, orderId: id, deviceIndex: 1, vehicleId: `veh-${id}`, fleetDeviceId, createdAt: NOW },
    ]);
  }

  return { installers, orders, applications, reader, sims, fleet, lookup, jobs, job };
}

describe("installation job statuses", () => {
  it("allows exactly the mapped transitions", () => {
    for (const from of INSTALLATION_ORDER_STATUSES) {
      for (const to of INSTALLATION_ORDER_STATUSES) {
        const allowed = INSTALLATION_ORDER_TRANSITIONS[from].includes(to);
        expect(canTransition({ status: from, preExceptionStatus: null }, to)).toBe(allowed);
      }
    }
    expect(INSTALLATION_ORDER_TRANSITIONS.completed).toEqual([]);
    expect(INSTALLATION_ORDER_TRANSITIONS.cancelled).toEqual([]);
  });

  it("refuses a transition off the map", () => {
    expect(() => assertTransition({ status: "unassigned", preExceptionStatus: null }, "in_progress")).toThrow(
      InvalidInstallationTransitionError,
    );
    expect(() => assertTransition({ status: "completed", preExceptionStatus: null }, "cancelled")).toThrow(
      InvalidInstallationTransitionError,
    );
  });

  it("resumes an issue at the status it interrupted, or cancels it", () => {
    const started = transitionOrder(order("1", { status: "accepted" }), "in_progress", NOW);
    const reported = transitionOrder(started, "issue_reported", NOW);

    expect(reported.preExceptionStatus).toBe("in_progress");
    expect(canTransition(reported, "in_progress")).toBe(true);
    expect(canTransition(reported, "scheduled")).toBe(false);
    expect(canTransition(reported, "cancelled")).toBe(true);
    expect(transitionOrder(reported, "in_progress", NOW).preExceptionStatus).toBeNull();
  });

  it("stamps each step", () => {
    const assigned = assignOrder(order("1"), "inst-1", NOW);
    expect(assigned).toMatchObject({ status: "assigned", installerId: "inst-1", assignedAt: NOW });
    expect(transitionOrder(assigned, "accepted", NOW).acceptedAt).toEqual(NOW);
    expect(transitionOrder({ ...assigned, status: "in_progress" }, "completed", NOW).completedAt).toEqual(NOW);
    expect(transitionOrder(assigned, "cancelled", NOW).cancelledAt).toEqual(NOW);
  });

  it("numbers jobs FL-NNNN from the sequence", async () => {
    expect(buildOrderNumber(1000)).toBe("FL-1000");
    expect(buildOrderNumber(7)).toBe("FL-0007");
    expect(await new InMemoryInstallationOrderRepository().nextOrderNumber()).toBe("FL-1000");
  });
});

describe("the status migration", () => {
  function sql(direction: "up" | "down"): string {
    const statements: string[] = [];
    const migration = Object.create(Migration20260924020000.prototype) as Migration20260924020000;
    Object.assign(migration, { addSql: (statement: string) => statements.push(statement) });
    void migration[direction]();
    return statements.join("\n");
  }

  it("maps scheduled to unassigned and installer_assigned to assigned", () => {
    const up = sql("up");
    expect(up).toMatch(/when 'scheduled' then 'unassigned'/);
    expect(up).toMatch(/when 'installer_assigned' then 'assigned'/);
    expect(up).toMatch(/set default 'unassigned'/);
    expect(up).toMatch(/installation_order_number_seq" start with 1000/);
    expect(up).toMatch(/"installer_id", "status"/);
    expect(up).toMatch(/"installer_id", "scheduled_date"/);
    expect(up).toMatch(/"fleet_device_id"\) where "fleet_device_id" is not null/);
  });

  it("maps back on the way down", () => {
    const down = sql("down");
    expect(down).toMatch(/when "installer_id" is null then 'scheduled'/);
    expect(down).toMatch(/else 'installer_assigned'/);
    expect(down).toMatch(/drop sequence if exists "installation_order_number_seq"/);
  });
});

describe("the installation sweep", () => {
  let h: Awaited<ReturnType<typeof harness>>;
  let sweep: SweepInstallationOrdersUseCase;

  beforeEach(async () => {
    h = await harness();
    sweep = new SweepInstallationOrdersUseCase(h.orders, new InstallerAssignmentService(h.installers, h.orders));
  });

  it("assigns waiting orders without overfilling anyone", async () => {
    await h.installers.save(installer("ada", { maxActiveJobs: 1 }));
    await h.installers.save(installer("bola", { maxActiveJobs: 1 }));
    await h.installers.save(installer("kano", { serviceAreas: ["Kano"] }));
    for (const id of ["o1", "o2", "o3"]) await h.orders.save(order(id, { scheduledDate: day("2026-09-30") }));

    expect(await sweep.run(NOW)).toEqual({ assigned: 2, overdue: 0 });
    const assigned = await Promise.all(["o1", "o2", "o3"].map((id) => h.orders.findById(id)));
    expect(assigned.map((o) => o?.installerId)).toEqual(["ada", "bola", null]);
    expect(assigned[0]).toMatchObject({ status: "assigned", assignedAt: NOW });
  });

  it("does not assign an order another replica already took", async () => {
    await h.installers.save(installer("ada"));
    await h.orders.save(order("o1"));
    const stale = (await h.orders.findById("o1"))!;
    await h.orders.save({ ...stale, status: "cancelled" });

    const assign = await new InstallerAssignmentService(h.installers, h.orders).assigner();
    expect(await assign(stale, NOW)).toBeNull();
    expect((await h.orders.findById("o1"))?.status).toBe("cancelled");
  });

  it("rechecks capacity at the write, so concurrent assigners cannot overfill anyone", async () => {
    await h.installers.save(installer("ada", { maxActiveJobs: 1 }));
    await h.installers.save(installer("bola", { maxActiveJobs: 1 }));
    await h.orders.save(order("o1"));
    await h.orders.save(order("o2"));
    await h.orders.save(order("o3"));
    const service = new InstallerAssignmentService(h.installers, h.orders);
    const [first, second, third] = await Promise.all([service.assigner(), service.assigner(), service.assigner()]);

    expect((await first((await h.orders.findById("o1"))!, NOW))?.installer.id).toBe("ada");
    expect((await second((await h.orders.findById("o2"))!, NOW))?.installer.id).toBe("bola");
    expect(await third((await h.orders.findById("o3"))!, NOW)).toBeNull();
    expect((await h.orders.findById("o3"))?.status).toBe("unassigned");
  });

  it("reads past a full page of orders nobody can take", async () => {
    await h.installers.save(installer("ada"));
    for (let i = 0; i < 150; i += 1) {
      await h.orders.save(order(`kano-${i}`, { state: "Kano", scheduledDate: day("2026-09-20") }));
    }
    await h.orders.save(order("lagos", { scheduledDate: day("2026-09-30") }));

    expect(await sweep.run(NOW)).toEqual({ assigned: 1, overdue: 0 });
    expect((await h.orders.findById("lagos"))?.installerId).toBe("ada");
  });

  it("marks jobs overdue once their Lagos day has passed", async () => {
    const lateEvening = new Date("2026-09-24T23:30:00Z");
    await h.orders.save(order("yesterday", { status: "accepted", installerId: "ada", scheduledDate: day("2026-09-24") }));
    await h.orders.save(order("today", { status: "scheduled", installerId: "ada", scheduledDate: day("2026-09-25") }));
    await h.orders.save(order("started", { status: "in_progress", installerId: "ada", scheduledDate: day("2026-09-20") }));

    expect(lagosDate(lateEvening)).toBe("2026-09-25");
    expect(await sweep.run(new Date("2026-09-24T22:30:00Z"))).toEqual({ assigned: 0, overdue: 0 });
    expect(await sweep.run(lateEvening)).toEqual({ assigned: 0, overdue: 1 });
    expect((await h.orders.findById("yesterday"))?.status).toBe("overdue");
    expect((await h.orders.findById("today"))?.status).toBe("scheduled");
    expect((await h.orders.findById("started"))?.status).toBe("in_progress");
  });
});

describe("an installer's jobs", () => {
  let h: Awaited<ReturnType<typeof harness>>;

  beforeEach(async () => {
    h = await harness();
    await h.installers.save(installer("ada"));
    await h.installers.save(installer("bola"));
    const mine = { installerId: "ada" };
    await h.job("1", "Lagos Express Logistics", { ...mine, status: "accepted", scheduledDate: day("2026-09-25") }, "dev-1");
    await h.job("2", "Adebayo Haulage", { ...mine, status: "scheduled", scheduledDate: day("2026-09-30"), city: "Surulere" });
    await h.job("3", "Northline Distribution", { ...mine, status: "in_progress", scheduledDate: day("2026-09-25") });
    await h.job("4", "Lagos Express Logistics", {
      ...mine, status: "completed", scheduledDate: day("2026-08-24"), completedAt: new Date("2026-08-24T15:00:00Z"),
    });
    await h.job("5", "Kano Movers", { ...mine, status: "cancelled", scheduledDate: day("2026-09-01"), cancelledAt: new Date("2026-09-01T09:00:00Z") });
    await h.job("6", "Other Customer", { installerId: "bola", status: "assigned", scheduledDate: day("2026-09-25") });
    h.fleet.set("tenant-1", [device("dev-1")]);
  });

  it("counts the dashboard on the Lagos day", async () => {
    const mine = { installerId: "ada" };
    await h.job("7", "Assigned Co", { ...mine, status: "assigned", scheduledDate: day("2026-09-27") });
    for (const id of ["8", "9"]) await h.job(id, "Late Co", { ...mine, status: "overdue", scheduledDate: day("2026-09-20") });
    for (const id of ["10", "11", "12"]) {
      await h.job(id, "Issue Co", { ...mine, status: "issue_reported", preExceptionStatus: "scheduled", scheduledDate: day("2026-09-26") });
    }
    await h.job("13", "Midday Co", { ...mine, status: "scheduled", scheduledDate: new Date("2026-09-25T09:00:00Z") });
    const dashboard = await h.jobs.dashboard("user-ada", new Date("2026-09-24T23:30:00Z"));

    expect(dashboard.counters).toEqual({
      newlyAssigned: 1, scheduledToday: 2, upcoming: 1, inProgress: 1, overdue: 2, completed: 1, issuesReported: 3,
    });
    expect(dashboard.statusOverview).toEqual({ accepted: 1, scheduled: 2, inProgress: 1, overdue: 2, completed: 1 });
    expect(dashboard.todaysJobs.map((j) => j.jobNumber)).toEqual(["FL-1", "FL-3", "FL-13"]);
    expect(dashboard.todaysJobs[0]).toMatchObject({
      customer: "Lagos Express Logistics",
      firstVehicle: { registrationNumber: "LSD-1-XA", make: "Mercedes-Benz", model: "Actros 1844" },
      firstDevice: { manufacturer: "Teltonika", model: "FMB920" },
      location: { city: "Ikeja", state: "Lagos" },
      vehicleCount: 1,
      deviceCount: 1,
      scheduledDate: "2026-09-25",
      timeSlotLabel: "Morning (8:00 – 12:00)",
    });
    expect((await h.jobs.dashboard("user-ada", new Date("2026-09-24T22:30:00Z"))).counters.scheduledToday).toBe(0);
  });

  it("lists active jobs with counts across every status", async () => {
    const active = await h.jobs.list("user-ada", {});

    expect(active.items.map((j) => j.jobNumber)).toEqual(["FL-1", "FL-3", "FL-2"]);
    expect(active.total).toBe(3);
    expect(active.countsByStatus).toMatchObject({ all: 5, accepted: 1, scheduled: 1, in_progress: 1, completed: 1, cancelled: 1, assigned: 0 });
  });

  it("lists history newest first with the completion date falling back to cancellation", async () => {
    const history = await h.jobs.list("user-ada", { scope: "history" });

    expect(history.items.map((j) => [j.jobNumber, j.completedAt])).toEqual([
      ["FL-5", "2026-09-01T09:00:00.000Z"],
      ["FL-4", "2026-08-24T15:00:00.000Z"],
    ]);
    const august = await h.jobs.list("user-ada", { scope: "history", completedFrom: "2026-08-01", completedTo: "2026-08-31" });
    expect(august.items.map((j) => j.jobNumber)).toEqual(["FL-4"]);
    await expect(h.jobs.list("user-ada", { scope: "history", completedFrom: "24/08/2026" })).rejects.toBeInstanceOf(OnboardingValidationError);
    await expect(h.jobs.list("user-ada", { scope: "history", completedTo: "2026-02-31" })).rejects.toBeInstanceOf(OnboardingValidationError);
  });

  it("filters by status within the scope and searches job, customer, vehicle and place", async () => {
    expect((await h.jobs.list("user-ada", { status: "scheduled" })).items.map((j) => j.jobNumber)).toEqual(["FL-2"]);
    expect((await h.jobs.list("user-ada", { status: "completed" })).items).toEqual([]);
    expect((await h.jobs.list("user-ada", { search: "adebayo" })).items.map((j) => j.jobNumber)).toEqual(["FL-2"]);
    expect((await h.jobs.list("user-ada", { search: "lsd-3" })).items.map((j) => j.jobNumber)).toEqual(["FL-3"]);
    expect((await h.jobs.list("user-ada", { search: "surulere" })).items.map((j) => j.jobNumber)).toEqual(["FL-2"]);
    expect((await h.jobs.list("user-ada", { search: "FL-1" })).items.map((j) => j.jobNumber)).toEqual(["FL-1"]);
    expect((await h.jobs.list("user-ada", { search: "other customer" })).items).toEqual([]);
  });

  it("answers another installer's job exactly like a missing one", async () => {
    await expect(h.jobs.detail("user-ada", "6")).rejects.toBeInstanceOf(InstallationJobNotFoundError);
    await expect(h.jobs.detail("user-ada", "nope")).rejects.toBeInstanceOf(InstallationJobNotFoundError);
  });

  it("shows the customer, site and each unit", async () => {
    await h.sims.save({
      id: "sim-1", iccid: "8923401234567890123", imsi: "621301234567890", msisdn: "+2347030001122", carrier: "MTN", plan: "iot_basic",
      status: "active", tenantId: "tenant-1", deviceId: "dev-1", deviceName: null, deviceImei: null, deviceType: null, vehicleId: null,
      suspensionReason: null, notes: null, dataUsageMb: 0, dataLimitMb: 0, smsUsage: 0, smsLimit: 0, monthlyCostNgn: 0,
      activationDate: null, expiryDate: null, lastActivity: null, signalStrength: null, networkType: "4G", roaming: false,
      fonuSimId: null, fonuStatus: null, createdAt: NOW, updatedAt: NOW,
    });
    const detail = await h.jobs.detail("user-ada", "1");

    expect(detail.customer).toEqual({
      customerName: "Lagos Express Logistics",
      customerType: "Enterprise",
      phone: "+2347014452219",
      email: "ops@1.ng",
      address: "14 Kudirat Abiola Way, Ikeja, Lagos",
      scheduledDate: "2026-09-25",
      timeSlot: "morning",
      timeSlotLabel: "Morning (8:00 – 12:00)",
    });
    expect(detail.units).toEqual([
      {
        index: 1,
        vehicle: {
          registrationNumber: "LSD-1-XA", vehicleType: "truck", make: "Mercedes-Benz", model: "Actros 1844", year: 2021,
          engineNumber: "OM471", chassisNumber: "WDB96", colour: "White", engineCapacity: "12.8L", odometer: 148220,
        },
        device: device("dev-1"),
        sim: { iccid: "8923401234567890123", imsi: "621301234567890", msisdn: "+2347030001122", carrier: "MTN", activationStatus: "Activated", network: "4G" },
      },
    ]);
    expect(h.lookup.forTenant).toHaveBeenCalledWith("tenant-1", ["dev-1"]);
  });

  it("still answers when fleet is down, without the device", async () => {
    h.lookup.down = true;
    const detail = await h.jobs.detail("user-ada", "1");

    expect(detail.units[0].device).toBeNull();
    expect(detail.units[0].vehicle?.registrationNumber).toBe("LSD-1-XA");
    expect((await h.jobs.list("user-ada", {})).items[0].firstDevice).toBeNull();
  });

  it("is refused to a caller who is not an installer", async () => {
    await expect(h.jobs.list("user-nobody", {})).rejects.toThrow("reserved for installers");
  });

  it("shuts out a suspended installer whose token was issued before the suspension", async () => {
    await h.installers.save({ ...(await h.installers.findById("ada"))!, status: "suspended" });

    await expect(h.jobs.dashboard("user-ada", NOW)).rejects.toThrow("reserved for installers");
    await expect(h.jobs.list("user-ada", {})).rejects.toThrow("reserved for installers");
    await expect(h.jobs.detail("user-ada", "1")).rejects.toThrow("reserved for installers");
  });
});

describe("an installer's profile", () => {
  let installers: InMemoryInstallerRepository;
  let users: InMemoryUserRepository;
  let photos: { store: ReturnType<typeof vi.fn>; remove: ReturnType<typeof vi.fn>; url: ReturnType<typeof vi.fn> };
  let scanner: { scan: ReturnType<typeof vi.fn> };
  let activity: { record: ReturnType<typeof vi.fn> };
  let profile: InstallerProfileUseCases;

  beforeEach(async () => {
    installers = new InMemoryInstallerRepository();
    users = new InMemoryUserRepository();
    await installers.save(installer("ada", { photoKey: "auth/installers/ada/photo/old.png" }));
    await users.save({
      id: "user-ada", email: "ada@fieldops.ng", passwordHash: "x", role: "INSTALLER", tenantId: "system",
      profile: { fullName: "ada Installer", phoneNumber: null, address: null, profilePictureUrl: null },
    });
    photos = {
      store: vi.fn(async () => "auth/installers/ada/photo/new.png"),
      remove: vi.fn(async () => {}),
      url: vi.fn(async (key: string | null) => (key ? `https://signed/${key}` : null)),
    };
    scanner = { scan: vi.fn(async () => ({ scanned: true, clean: true })) };
    activity = { record: vi.fn(async () => ({})) };
    const tokens = { resolveAccessToken: (token: string) => ({ id: token }) };
    const config = { fleet: { documentScanRequired: true } };
    profile = new InstallerProfileUseCases(tokens as never, installers, users, photos, scanner, activity as never, config as never);
  });

  it("shows personal details with a signed photo link and the read-only record", async () => {
    expect(await profile.get("user-ada")).toEqual({
      personal: {
        firstName: "ada", lastName: "Installer", email: "ada@fieldops.ng", phoneNumber: "+2348031234567",
        state: "Lagos", city: "Ikeja", photoUrl: "https://signed/auth/installers/ada/photo/old.png",
      },
      record: {
        code: "INS-ada", status: "active", serviceAreas: ["Lagos"],
        capabilities: [{ key: "device_installation", label: "Device installation" }], createdAt: NOW.toISOString(),
      },
    });
  });

  it("saves the edit, carries the name onto the sign-in account and logs it", async () => {
    const view = await profile.update("user-ada", { firstName: "Tunde", lastName: "Akinwale", phoneNumber: "0803 221 4478", state: "ogun", city: "Abeokuta" });

    expect(view.personal).toMatchObject({ firstName: "Tunde", lastName: "Akinwale", phoneNumber: "+2348032214478", state: "Ogun", city: "Abeokuta" });
    expect((await installers.findById("ada"))?.fullName).toBe("Tunde Akinwale");
    expect((await users.findById("user-ada"))?.profile?.fullName).toBe("Tunde Akinwale");
    expect(activity.record).toHaveBeenCalledWith(expect.objectContaining({ action: "installer.profile.updated", entityId: "ada" }));
  });

  it("is closed to a suspended installer", async () => {
    await installers.save({ ...(await installers.findById("ada"))!, status: "suspended" });
    await expect(profile.get("user-ada")).rejects.toThrow("reserved for installers");
    await expect(profile.update("user-ada", { city: "Yaba" })).rejects.toThrow("reserved for installers");
  });

  it("refuses an invalid phone or state", async () => {
    await expect(profile.update("user-ada", { phoneNumber: "12345" })).rejects.toBeInstanceOf(OnboardingValidationError);
    await expect(profile.update("user-ada", { state: "Atlantis" })).rejects.toBeInstanceOf(OnboardingValidationError);
  });

  it("stores a scanned PNG and deletes the old one", async () => {
    const view = await profile.uploadPhoto("user-ada", { originalname: "me.png", mimetype: "image/png", size: PNG.length, buffer: PNG });

    expect(photos.store).toHaveBeenCalledWith("ada", expect.objectContaining({ mimeType: "image/png", extension: ".png" }));
    expect(photos.remove).toHaveBeenCalledWith("auth/installers/ada/photo/old.png");
    expect((await installers.findById("ada"))?.photoKey).toBe("auth/installers/ada/photo/new.png");
    expect(view.personal.photoUrl).toBe("https://signed/auth/installers/ada/photo/new.png");
  });

  it("refuses what is not a JPG or PNG, whatever it claims, and anything over 2 MB", async () => {
    const pdf = Buffer.from("%PDF-1.7 not a photo");
    const upload = (buffer: Buffer) => profile.uploadPhoto("user-ada", { originalname: "me.png", mimetype: "image/png", size: buffer.length, buffer });

    await expect(upload(pdf)).rejects.toBeInstanceOf(InvalidInstallerPhotoError);
    await expect(upload(Buffer.from("GIF89a...."))).rejects.toBeInstanceOf(InvalidInstallerPhotoError);
    await expect(upload(Buffer.concat([PNG, Buffer.alloc(2 * 1024 * 1024)]))).rejects.toThrow("2MB");
    expect(photos.store).not.toHaveBeenCalled();
  });

  it("refuses a photo the scanner flags, or cannot scan while scanning is required", async () => {
    const upload = () => profile.uploadPhoto("user-ada", { originalname: "me.png", mimetype: "image/png", size: PNG.length, buffer: PNG });

    scanner.scan.mockResolvedValueOnce({ scanned: true, clean: false, reason: "EICAR" });
    await expect(upload()).rejects.toThrow("EICAR");
    scanner.scan.mockResolvedValueOnce({ scanned: false, clean: false });
    await expect(upload()).rejects.toBeInstanceOf(InvalidInstallerPhotoError);
    expect(photos.store).not.toHaveBeenCalled();
  });
});

describe("admins binding a unit's device", () => {
  let h: Awaited<ReturnType<typeof harness>>;
  let admin: ManageInstallationOrdersUseCases;
  let activity: { record: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    h = await harness();
    const users = new InMemoryUserRepository();
    await users.save({ id: "platform", email: "p@co.com", passwordHash: "x", role: "PLATFORM_ADMIN", tenantId: "system" });
    await users.save({ id: "gov", email: "g@co.com", passwordHash: "x", role: "GOVERNANCE_OFFICER", tenantId: "system" });
    const access = new AccessResolver(new InMemoryTenantRoleRepository(), new InMemoryPermissionRemovalRepository());
    activity = { record: vi.fn(async () => ({})) };
    admin = new ManageInstallationOrdersUseCases(
      h.orders, h.reader, h.installers, h.lookup,
      { resolveAccessToken: (t: string) => (["platform", "gov"].includes(t) ? { id: t, email: `${t}@co.com`, role: t === "platform" ? "PLATFORM_ADMIN" : "GOVERNANCE_OFFICER" } : null) } as never,
      users, access, activity as never,
    );
    await h.installers.save(installer("ada"));
    await h.job("1", "Lagos Express Logistics", { installerId: "ada", status: "assigned" });
    await h.job("2", "Adebayo Haulage", { installerId: "ada", status: "assigned" });
    h.fleet.set("tenant-1", [device("dev-1")]);
    h.fleet.set("tenant-2", [device("dev-2")]);
  });

  it("binds a device the order's own customer holds", async () => {
    const unit = await admin.bindUnitDevice("platform", "1", 1, "dev-1");

    expect(unit).toEqual({ index: 1, vehicleId: "veh-1", device: device("dev-1") });
    expect((await h.orders.findAssignments("1"))[0].fleetDeviceId).toBe("dev-1");
    expect(h.lookup.forTenant).toHaveBeenCalledWith("tenant-1", ["dev-1"]);
    expect(activity.record).toHaveBeenCalledWith(expect.objectContaining({ action: "system.installation.unit_bound" }));
  });

  it("refuses another customer's device, one already bound, and a closed job", async () => {
    await expect(admin.bindUnitDevice("platform", "1", 1, "dev-2")).rejects.toBeInstanceOf(FleetDeviceRefusedError);
    await admin.bindUnitDevice("platform", "2", 1, "dev-2");
    h.fleet.set("tenant-1", [device("dev-1"), device("dev-2")]);
    await expect(admin.bindUnitDevice("platform", "1", 1, "dev-2")).rejects.toBeInstanceOf(FleetDeviceRefusedError);

    await h.orders.save({ ...(await h.orders.findById("1"))!, status: "completed" as InstallationOrderStatus });
    await expect(admin.bindUnitDevice("platform", "1", 1, "dev-1")).rejects.toBeInstanceOf(InstallationJobClosedError);
  });

  it("refuses the loser of two concurrent binds of one device as already bound", async () => {
    h.fleet.set("tenant-1", [device("dev-1"), device("dev-2")]);
    await admin.bindUnitDevice("platform", "2", 1, "dev-2");
    vi.spyOn(h.orders, "findAssignmentByFleetDeviceId").mockResolvedValueOnce(null);

    await expect(admin.bindUnitDevice("platform", "1", 1, "dev-2")).rejects.toBeInstanceOf(DeviceAlreadyBoundError);
    expect((await h.orders.findAssignments("1"))[0].fleetDeviceId).toBeNull();
  });

  it("refuses a unit that is not on the job, and waits when fleet is down", async () => {
    await expect(admin.bindUnitDevice("platform", "1", 2, "dev-1")).rejects.toBeInstanceOf(InstallationJobNotFoundError);
    h.lookup.down = true;
    await expect(admin.bindUnitDevice("platform", "1", 1, "dev-1")).rejects.toBeInstanceOf(FleetUnavailableError);
  });

  it("lists every job with its installer, and is closed to staff without the permission", async () => {
    const list = await admin.list("platform", { search: "adebayo" });

    expect(list.items).toHaveLength(1);
    expect(list.items[0]).toMatchObject({ jobNumber: "FL-2", tenantId: "tenant-2", installer: { id: "ada", code: "INS-ada" } });
    await expect(admin.list("gov", {})).rejects.toThrow();
  });
});

it("reads Lagos days from UTC instants", () => {
  expect(lagosToday(new Date("2026-09-24T22:59:59Z"))).toEqual(day("2026-09-24"));
  expect(lagosToday(new Date("2026-09-24T23:00:00Z"))).toEqual(day("2026-09-25"));
});

it("stores a booking as the Lagos day it asks for, at UTC midnight", () => {
  expect(bookingDay("2026-10-05")).toEqual(day("2026-10-05"));
  expect(bookingDay("2026-10-05T09:00:00Z")).toEqual(day("2026-10-05"));
  expect(bookingDay("2026-10-05T23:30:00Z")).toEqual(day("2026-10-06"));
  expect(() => bookingDay("soon")).toThrow("not a date");
});

describe("an installer's device scope", () => {
  const NOW_LAGOS_MORNING = new Date("2026-09-24T10:00:00Z");
  let h: Awaited<ReturnType<typeof harness>>;
  let scope: InstallerDeviceScopeUseCase;

  beforeEach(async () => {
    h = await harness();
    scope = new InstallerDeviceScopeUseCase(h.reader);
    await h.installers.save(installer("ada"));
    await h.installers.save(installer("bola"));
  });

  const ids = async (userId = "user-ada", now = NOW_LAGOS_MORNING) =>
    (await scope.forUser(userId, now)).map((entry) => entry.deviceId);

  it("covers every bound device on open jobs, and none on closed or unbound ones", async () => {
    const mine = { installerId: "ada" };
    const open = ["assigned", "accepted", "scheduled", "in_progress", "overdue", "issue_reported"] as const;
    for (const [i, status] of open.entries()) await h.job(`o${i}`, "Open Co", { ...mine, status }, `dev-o${i}`);
    await h.job("u", "Unassigned Co", { status: "unassigned" }, "dev-u");
    await h.job("c", "Cancelled Co", { ...mine, status: "cancelled", cancelledAt: NOW_LAGOS_MORNING }, "dev-c");
    await h.job("n", "Unbound Co", { ...mine, status: "scheduled" });
    await h.job("b", "Bola Co", { installerId: "bola", status: "scheduled" }, "dev-b");

    expect((await ids()).sort()).toEqual(open.map((_, i) => `dev-o${i}`).sort());
    expect(await scope.forUser("user-ada", NOW_LAGOS_MORNING)).toContainEqual({
      tenantId: "tenant-o0", orderId: "o0", jobNumber: "FL-o0", deviceId: "dev-o0",
    });
  });

  it("keeps devices on jobs completed today in Lagos, from Lagos midnight", async () => {
    const done = (id: string, completedAt: string) =>
      h.job(id, "Done Co", { installerId: "ada", status: "completed", completedAt: new Date(completedAt) }, `dev-${id}`);
    await done("before", "2026-09-23T22:59:00Z");
    await done("after", "2026-09-23T23:00:00Z");
    await done("late", "2026-09-24T22:59:00Z");
    await done("tomorrow", "2026-09-24T23:00:00Z");

    expect((await ids()).sort()).toEqual(["dev-after", "dev-late"]);
  });

  it("is empty for a suspended or unknown installer", async () => {
    await h.job("1", "Open Co", { installerId: "ada", status: "scheduled" }, "dev-1");
    expect(await ids()).toEqual(["dev-1"]);

    await h.installers.save(installer("ada", { status: "suspended" }));
    expect(await ids()).toEqual([]);
    expect(await ids("user-nobody")).toEqual([]);
  });

  it("answers fleet only", async () => {
    const callers = { serviceFor: vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce("fleet") };
    const controller = new InternalInstallersController(scope, callers as never);
    await expect(controller.deviceScope("user-ada", {})).rejects.toThrow("Invalid service token");
    expect(callers.serviceFor).toHaveBeenCalledWith({}, ["fleet"]);

    await h.job("1", "Open Co", { installerId: "ada", status: "scheduled" }, "dev-1");
    expect((await controller.deviceScope("user-ada", {})).data.map((entry) => entry.deviceId)).toEqual(["dev-1"]);
  });
});
