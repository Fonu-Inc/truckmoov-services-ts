import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  CHECKLIST_ITEMS,
  FleetDeviceRefusedError,
  InMemoryInstallationCompletion,
  InMemoryInstallationJobReader,
  InMemoryInstallationOrderRepository,
  InMemoryInstallerRepository,
  InstallationJobClosedError,
  InstallationJobConflictError,
  InstallationJobNotFoundError,
  InstallerJobActionsUseCases,
  InstallerJobRecordsUseCases,
  InstallerJobsUseCases,
  InvalidEvidenceError,
  type StoredInstaller,
} from "@auth/installation";
import type { InstallationOrderStatus } from "@auth/installation/domain/installation-order";
import type { StoredInstallationOrder } from "@auth/installation/domain/installation-order.repository";
import type { JobDevice } from "@auth/installation/domain/ports/job-device-lookup.port";
import { moveJob } from "@auth/installation/application/use-cases/support/job-transition";
import { InMemoryOnboardingApplicationRepository } from "@auth/onboarding/infrastructure/persistence/in-memory-onboarding-application.repository";
import type { StoredOnboardingApplication } from "@auth/onboarding/domain/onboarding-application.repository";
import { OnboardingValidationError } from "@auth/onboarding/domain/onboarding-application.validation";
import { InvalidStageTransitionError } from "@auth/onboarding/domain/onboarding-stage";
import { InMemorySimRepository } from "../../../apps/auth/src/in-memory-sim.repository";
import { InMemorySupportTicketRepository } from "../../../apps/auth/src/in-memory-support-ticket.repository";
import { Migration20260924040000 } from "../../../apps/auth/src/migrations/Migration20260924040000";
import { Migration20261127110000 } from "../../../apps/auth/src/migrations/Migration20261127110000";

const NOW = new Date("2026-09-24T10:00:00Z");
const TENANT = "tenant-1";
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]);
const WEBP = Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBPVP8 "), Buffer.alloc(16)]);

function installer(id: string): StoredInstaller {
  return {
    id, userId: `user-${id}`, code: `INS-${id}`, firstName: id, lastName: "Installer", fullName: `${id} Installer`,
    email: `${id}@fieldops.ng`, phoneNumber: "+2348031234567", team: "", state: "Lagos", city: "Ikeja", serviceAreas: ["Lagos"],
    capabilities: ["device_installation"], photoKey: null, notificationPreferences: null, displayPreferences: null, workPreferences: null,
    status: "active", maxActiveJobs: 3,
    lastActivityAt: null, createdAt: NOW, updatedAt: NOW,
  };
}

function order(overrides: Partial<StoredInstallationOrder> = {}): StoredInstallationOrder {
  return {
    id: "job-1", orderNumber: "FL-1000", applicationId: "app-1", tenantId: TENANT, scheduledDate: new Date("2026-09-25T00:00:00Z"),
    timeSlot: "morning", addressLine: "14 Kudirat Abiola Way", city: "Ikeja", state: "Lagos", siteContactName: "Ada",
    siteContactPhone: "+2347014452219", notes: null, installerNotes: null, installerId: "ada", status: "assigned",
    preExceptionStatus: null, assignedAt: NOW, acceptedAt: null, startedAt: null, issueReportedAt: null, completedAt: null, cancelledAt: null,
    createdAt: NOW, updatedAt: NOW, ...overrides,
  };
}

function application(stage: StoredOnboardingApplication["stage"] = "installation"): StoredOnboardingApplication {
  return {
    id: "app-1", reference: "APP-1", tokenHash: "hash", applicantType: "enterprise", organizationName: "Lagos Express Logistics",
    businessEmail: "ops@lex.ng", organizationPhone: "+2348000000000", contactFullName: "Jane Doe", contactRole: null,
    streetAddress: "Street", city: "Ikeja", state: "Lagos", rcNumber: null, taxIdentificationNumber: null, identificationType: null,
    identificationNumber: null, m2mPlanCode: null, billingEmail: null, billingEmailVerifiedAt: null, stage, emailVerifiedAt: NOW,
    phoneVerifiedAt: NOW, status: "approved", submittedAt: NOW, reviewedBy: null, reviewedAt: null, decisionReason: null,
    tenantId: TENANT, setupLinkStatus: null, setupLinkSentAt: null, setupLinkError: null, setupLinkAttempts: 0,
    createdAt: NOW, updatedAt: NOW,
  };
}

function device(id: string, verificationStatus: string | null): JobDevice {
  return {
    id, name: null, imei: "356938035643809", manufacturer: "Teltonika", model: "FMB920", status: "configured",
    statusLabel: "Configured", deviceType: null, verificationStatus,
  };
}

function photo(buffer: Buffer, originalname = "fitted unit.png") {
  return { originalname, mimetype: "image/png", size: buffer.length, buffer };
}

async function harness() {
  const installers = new InMemoryInstallerRepository();
  const orders = new InMemoryInstallationOrderRepository();
  const applications = new InMemoryOnboardingApplicationRepository();
  const fleetDevices = new Map<string, JobDevice>();
  const lookup = {
    forTenant: vi.fn(async (tenantId: string, ids: string[]) =>
      tenantId === TENANT ? new Map(ids.flatMap((id) => (fleetDevices.has(id) ? [[id, fleetDevices.get(id)!] as const] : []))) : new Map(),
    ),
  };
  const fleet = {
    beginVerification: vi.fn(async (_tenantId: string, ids: string[]) => ids.map((deviceId) => ({ deviceId, outcome: "started" as const }))),
    handOver: vi.fn(async () => {}),
  };
  const storage = {
    store: vi.fn(async () => {}),
    downloadUrl: vi.fn(async (key: string) => `https://signed/${key}`),
    delete: vi.fn(async (_key: string) => {}),
  };
  const activity = { record: vi.fn(async () => ({})) };
  const scanner = { scan: vi.fn(async () => ({ scanned: true, clean: true })) };
  const tokens = { resolveAccessToken: (token: string) => ({ id: token }) };
  const config = { fleet: { documentScanRequired: true } };

  const completion = new InMemoryInstallationCompletion(orders, applications);
  const actions = new InstallerJobActionsUseCases(tokens as never, installers, orders, applications, lookup, fleet, completion);
  const records = new InstallerJobRecordsUseCases(tokens as never, installers, orders, lookup, storage, scanner, config as never, activity as never);
  const reader = new InMemoryInstallationJobReader(orders, applications, installers);
  const jobs = new InstallerJobsUseCases(tokens as never, installers, orders, reader, applications, lookup, new InMemorySimRepository(), new InMemorySupportTicketRepository());

  await installers.save(installer("ada"));
  await installers.save(installer("bola"));
  await applications.save(application());
  await applications.saveVehicle({
    id: "veh-1", applicationId: "app-1", registrationNumber: "LSD-123-XA", vehicleType: "truck", make: "Mercedes-Benz",
    model: "Actros 1844", year: 2021, engineNumber: null, chassisNumber: null, color: null, engineCapacity: null,
    odometerReading: null, purchaseType: null, purchaseTypeOther: null, createdAt: NOW, updatedAt: NOW,
  });

  async function givenJob(overrides: Partial<StoredInstallationOrder> = {}, fleetDeviceId: string | null = "dev-1") {
    await orders.save(order(overrides));
    await orders.replaceAssignments("job-1", [
      { id: "unit-1", orderId: "job-1", deviceIndex: 1, vehicleId: "veh-1", fleetDeviceId, createdAt: NOW },
    ]);
  }

  async function tickAll(except: string[] = []) {
    for (const item of CHECKLIST_ITEMS.filter((i) => !except.includes(i.key))) {
      await orders.saveTick({ orderId: "job-1", itemKey: item.key, checkedAt: NOW, checkedBy: "ada" });
    }
  }

  async function withEvidence(vehicleId = "veh-1") {
    await records.uploadEvidence("user-ada", "job-1", "device_installation", vehicleId, photo(PNG), NOW);
  }

  async function withSecondVehicle(fleetDeviceId: string | null = "dev-2") {
    await applications.saveVehicle({
      id: "veh-2", applicationId: "app-1", registrationNumber: "ABC-456-YZ", vehicleType: "van", make: "Toyota",
      model: "Hiace", year: 2020, engineNumber: null, chassisNumber: null, color: null, engineCapacity: null,
      odometerReading: null, purchaseType: null, purchaseTypeOther: null, createdAt: NOW, updatedAt: NOW,
    });
    await orders.replaceAssignments("job-1", [
      { id: "unit-1", orderId: "job-1", deviceIndex: 1, vehicleId: "veh-1", fleetDeviceId: "dev-1", createdAt: NOW },
      { id: "unit-2", orderId: "job-1", deviceIndex: 2, vehicleId: "veh-2", fleetDeviceId, createdAt: NOW },
    ]);
  }

  return { installers, orders, applications, fleetDevices, lookup, fleet, storage, activity, scanner, actions, records, jobs, givenJob, tickAll, withEvidence, withSecondVehicle };
}

type Harness = Awaited<ReturnType<typeof harness>>;

async function status(h: Harness): Promise<InstallationOrderStatus | undefined> {
  return (await h.orders.findById("job-1"))?.status;
}

describe("accepting a job", () => {
  let h: Harness;
  beforeEach(async () => {
    h = await harness();
  });

  it("schedules the offer and stamps the acceptance", async () => {
    await h.givenJob();
    await h.actions.accept("user-ada", "job-1", NOW);

    expect(await h.orders.findById("job-1")).toMatchObject({ status: "scheduled", acceptedAt: NOW });
  });

  it("refuses every status but assigned", async () => {
    for (const from of ["scheduled", "overdue", "in_progress", "completed", "cancelled"] as const) {
      await h.givenJob({ status: from });
      await expect(h.actions.accept("user-ada", "job-1", NOW)).rejects.toBeInstanceOf(InstallationJobConflictError);
    }
  });

  it("leaves resuming a reported issue to the admin", async () => {
    await h.givenJob({ status: "issue_reported", preExceptionStatus: "assigned" });

    await expect(h.actions.accept("user-ada", "job-1", NOW)).rejects.toBeInstanceOf(InstallationJobConflictError);
    expect(await h.orders.findById("job-1")).toMatchObject({ status: "issue_reported", preExceptionStatus: "assigned" });
  });

  it("answers another installer's job like a missing one", async () => {
    await h.givenJob();
    await expect(h.actions.accept("user-bola", "job-1", NOW)).rejects.toBeInstanceOf(InstallationJobNotFoundError);
    await expect(h.actions.accept("user-ada", "nope", NOW)).rejects.toBeInstanceOf(InstallationJobNotFoundError);
  });

  it("applies once when two accepts race", async () => {
    await h.givenJob();
    const results = await Promise.allSettled([h.actions.accept("user-ada", "job-1", NOW), h.actions.accept("user-ada", "job-1", NOW)]);

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await status(h)).toBe("scheduled");
  });

  it("refuses a move made from a stale read", async () => {
    await h.givenJob();
    const stale = (await h.orders.findById("job-1"))!;
    await h.actions.accept("user-ada", "job-1", NOW);

    await expect(moveJob(h.orders, stale, "scheduled", NOW)).rejects.toBeInstanceOf(InstallationJobConflictError);
    await expect(moveJob(h.orders, stale, "cancelled", NOW)).rejects.toBeInstanceOf(InstallationJobConflictError);
    expect(await status(h)).toBe("scheduled");
  });
});

describe("starting a job", () => {
  let h: Harness;
  beforeEach(async () => {
    h = await harness();
  });

  it("starts from scheduled or overdue, on any day", async () => {
    for (const from of ["scheduled", "overdue"] as const) {
      await h.givenJob({ status: from, scheduledDate: new Date("2026-12-01T00:00:00Z") });
      await h.actions.start("user-ada", "job-1", NOW);
      expect(await h.orders.findById("job-1")).toMatchObject({ status: "in_progress", startedAt: NOW });
    }
  });

  it("refuses the other statuses with a conflict", async () => {
    for (const from of ["assigned", "in_progress", "issue_reported", "completed", "cancelled"] as const) {
      await h.givenJob({ status: from });
      await expect(h.actions.start("user-ada", "job-1", NOW)).rejects.toBeInstanceOf(InstallationJobConflictError);
      expect(await status(h)).toBe(from);
    }
  });

  it("refuses while a unit has no bound device", async () => {
    await h.givenJob({ status: "scheduled" }, null);

    await expect(h.actions.start("user-ada", "job-1", NOW)).rejects.toThrow("Every unit needs its device bound");
    expect(await status(h)).toBe("scheduled");
    expect(h.fleet.beginVerification).not.toHaveBeenCalled();
  });

  it("opens verification on the job's devices in the order's tenant", async () => {
    await h.givenJob({ status: "scheduled" });
    await h.actions.start("user-ada", "job-1", NOW);

    expect(h.fleet.beginVerification).toHaveBeenCalledWith(TENANT, ["dev-1"]);
  });

  it("stays started when fleet fails or cannot be asked", async () => {
    await h.givenJob({ status: "scheduled" });
    h.fleet.beginVerification.mockRejectedValueOnce(new Error("boom"));
    await h.actions.start("user-ada", "job-1", NOW);
    expect(await status(h)).toBe("in_progress");

    await h.givenJob({ status: "scheduled" });
    h.fleet.beginVerification.mockResolvedValueOnce(null as never);
    await h.actions.start("user-ada", "job-1", NOW);
    expect(await status(h)).toBe("in_progress");
  });
});

describe("the checklist", () => {
  let h: Harness;
  beforeEach(async () => {
    h = await harness();
    await h.givenJob({ status: "in_progress" });
  });

  it("has 15 items in groups of 5, 6 and 4", async () => {
    const detail = await h.jobs.detail("user-ada", "job-1");

    expect(detail.checklist.groups.map((g) => [g.label, g.items.length])).toEqual([
      ["Before Installation", 5], ["Installation", 6], ["Verification", 4],
    ]);
    expect(detail.checklist).toMatchObject({ completed: 0, total: 15 });
    expect(detail.checklist.groups[2].items.map((i) => i.gated)).toEqual(["device_communicating", undefined, undefined, "evidence"]);
  });

  it("ticks and unticks an item", async () => {
    await h.records.setChecklistItem("user-ada", "job-1", "install_device", true, NOW);
    expect((await h.orders.findTicks("job-1")).map((t) => [t.itemKey, t.checkedBy])).toEqual([["install_device", "ada"]]);

    await h.records.setChecklistItem("user-ada", "job-1", "install_device", false, NOW);
    expect(await h.orders.findTicks("job-1")).toEqual([]);
  });

  it("answers an unknown item as not found", async () => {
    await expect(h.records.setChecklistItem("user-ada", "job-1", "nope", true, NOW)).rejects.toBeInstanceOf(InstallationJobNotFoundError);
  });

  it("changes only while the job is in progress", async () => {
    await h.givenJob({ status: "scheduled" });
    await expect(h.records.setChecklistItem("user-ada", "job-1", "install_device", true, NOW)).rejects.toBeInstanceOf(
      InstallationJobConflictError,
    );
    await expect(h.records.setChecklistItem("user-ada", "job-1", "install_device", false, NOW)).rejects.toBeInstanceOf(
      InstallationJobConflictError,
    );
  });

  it("ticks device communicating only once every job device is verified", async () => {
    const tick = () => h.records.setChecklistItem("user-ada", "job-1", "confirm_device_communicating", true, NOW);
    h.fleetDevices.set("dev-1", device("dev-1", "waiting"));
    await expect(tick()).rejects.toBeInstanceOf(InstallationJobConflictError);

    h.fleetDevices.set("dev-1", device("dev-1", "verified"));
    await tick();
    expect(h.lookup.forTenant).toHaveBeenCalledWith(TENANT, ["dev-1"]);
    expect((await h.orders.findTicks("job-1")).map((t) => t.itemKey)).toEqual(["confirm_device_communicating"]);
  });

  it("ticks evidence only once a photo is uploaded", async () => {
    const tick = () => h.records.setChecklistItem("user-ada", "job-1", "capture_installation_evidence", true, NOW);
    await expect(tick()).rejects.toThrow("Upload at least one photo for each vehicle first (0 of 1 vehicles covered)");

    await h.withEvidence();
    await tick();
    expect((await h.orders.findTicks("job-1")).map((t) => t.itemKey)).toEqual(["capture_installation_evidence"]);
  });

  it("needs a photo for each vehicle before ticking evidence", async () => {
    await h.withSecondVehicle();
    const tick = () => h.records.setChecklistItem("user-ada", "job-1", "capture_installation_evidence", true, NOW);

    await h.withEvidence("veh-1");
    await h.withEvidence("veh-1");
    await expect(tick()).rejects.toThrow("Upload at least one photo for each vehicle first (1 of 2 vehicles covered)");

    await h.withEvidence("veh-2");
    await tick();
    expect((await h.orders.findTicks("job-1")).map((t) => t.itemKey)).toEqual(["capture_installation_evidence"]);
  });

  it("counts a legacy photo with no vehicle as covering every vehicle", async () => {
    await h.withSecondVehicle();
    await h.orders.saveEvidence({
      id: "legacy", orderId: "job-1", category: "device_installation", vehicleId: null, fileKey: "k", fileHash: "h",
      fileSize: 1, mimeType: "image/png", uploadedBy: "ada", createdAt: NOW,
    });
    await h.records.setChecklistItem("user-ada", "job-1", "capture_installation_evidence", true, NOW);
    expect((await h.orders.findTicks("job-1")).map((t) => t.itemKey)).toEqual(["capture_installation_evidence"]);
  });

  it("always allows unticking a gated item", async () => {
    await h.orders.saveTick({ orderId: "job-1", itemKey: "confirm_device_communicating", checkedAt: NOW, checkedBy: "ada" });

    await h.records.setChecklistItem("user-ada", "job-1", "confirm_device_communicating", false, NOW);
    expect(await h.orders.findTicks("job-1")).toEqual([]);
  });
});

describe("installer notes", () => {
  let h: Harness;
  beforeEach(async () => {
    h = await harness();
  });

  it("saves in any open status", async () => {
    for (const from of ["assigned", "scheduled", "in_progress", "overdue", "issue_reported"] as const) {
      await h.givenJob({ status: from });
      await h.records.saveNotes("user-ada", "job-1", `note ${from}`, NOW);
      expect((await h.orders.findById("job-1"))?.installerNotes).toBe(`note ${from}`);
    }
  });

  it("refuses more than 2000 characters", async () => {
    await h.givenJob();
    await h.records.saveNotes("user-ada", "job-1", "x".repeat(2000), NOW);
    await expect(h.records.saveNotes("user-ada", "job-1", "x".repeat(2001), NOW)).rejects.toBeInstanceOf(OnboardingValidationError);
  });

  it("refuses a completed or cancelled job", async () => {
    for (const from of ["completed", "cancelled"] as const) {
      await h.givenJob({ status: from });
      await expect(h.records.saveNotes("user-ada", "job-1", "late", NOW)).rejects.toBeInstanceOf(InstallationJobClosedError);
    }
  });
});

describe("evidence", () => {
  let h: Harness;
  beforeEach(async () => {
    h = await harness();
    await h.givenJob({ status: "scheduled" });
  });

  const upload = (h: Harness, buffer: Buffer, category = "device_installation", name?: string, vehicleId: unknown = "veh-1") =>
    h.records.uploadEvidence("user-ada", "job-1", category, vehicleId, photo(buffer, name), NOW);

  it("stores a scanned photo privately under the order's tenant", async () => {
    const view = await upload(h, PNG);

    const [stored] = await h.orders.findEvidence("job-1");
    expect(stored.fileKey).toBe(`${TENANT}/installations/job-1/evidence/device_installation/${stored.id}-fitted-unit.png`);
    expect(stored).toMatchObject({ category: "device_installation", vehicleId: "veh-1", mimeType: "image/png", fileSize: PNG.length, uploadedBy: "ada" });
    expect(stored.fileHash).toMatch(/^[0-9a-f]{64}$/);
    expect(h.storage.store).toHaveBeenCalledWith(stored.fileKey, expect.objectContaining({ mimeType: "image/png" }));
    expect(view).toMatchObject({ id: stored.id, vehicleId: "veh-1", label: "Device installation", fileName: "fitted-unit.png", size: PNG.length });
  });

  it("refuses a missing vehicle or one that is not on the job", async () => {
    await expect(upload(h, PNG, "device_installation", undefined, null)).rejects.toThrow("vehicleId must be one of this job's vehicles");
    await expect(upload(h, PNG, "device_installation", undefined, "veh-9")).rejects.toBeInstanceOf(InvalidEvidenceError);
    expect(h.storage.store).not.toHaveBeenCalled();
  });

  it("takes a WebP named after its bytes", async () => {
    await upload(h, WEBP, "device_installation", "shot.png");
    expect((await h.orders.findEvidence("job-1"))[0]).toMatchObject({ mimeType: "image/webp" });
    expect((await h.orders.findEvidence("job-1"))[0].fileKey).toMatch(/-shot\.webp$/);
  });

  it("refuses an unknown category, a non-image whatever it claims, and anything over 10 MB", async () => {
    await expect(upload(h, PNG, "selfie")).rejects.toBeInstanceOf(InvalidEvidenceError);
    await expect(upload(h, Buffer.from("%PDF-1.7 not a photo"))).rejects.toBeInstanceOf(InvalidEvidenceError);
    await expect(upload(h, Buffer.from("GIF89a...."))).rejects.toBeInstanceOf(InvalidEvidenceError);
    await expect(upload(h, Buffer.concat([PNG, Buffer.alloc(10 * 1024 * 1024)]))).rejects.toThrow("10MB");
    expect(h.storage.store).not.toHaveBeenCalled();
  });

  it("refuses a photo the scanner flags or cannot scan", async () => {
    h.scanner.scan.mockResolvedValueOnce({ scanned: true, clean: false, reason: "EICAR" } as never);
    await expect(upload(h, PNG)).rejects.toThrow("EICAR");
    h.scanner.scan.mockResolvedValueOnce({ scanned: false, clean: false } as never);
    await expect(upload(h, PNG)).rejects.toBeInstanceOf(InvalidEvidenceError);
    expect(h.storage.store).not.toHaveBeenCalled();
  });

  it("refuses a completed or cancelled job", async () => {
    await h.givenJob({ status: "completed" });
    await expect(upload(h, PNG)).rejects.toBeInstanceOf(InstallationJobClosedError);
  });

  it("links only the caller's own evidence", async () => {
    const view = await upload(h, PNG);

    const link = await h.records.evidenceLink("user-ada", "job-1", view.id);
    expect(link.url).toMatch(/^https:\/\/signed\/tenant-1\/installations\/job-1\//);
    await expect(h.records.evidenceLink("user-bola", "job-1", view.id)).rejects.toBeInstanceOf(InstallationJobNotFoundError);
    await expect(h.records.evidenceLink("user-ada", "job-1", "nope")).rejects.toBeInstanceOf(InstallationJobNotFoundError);
  });
});

describe("removing evidence", () => {
  let h: Harness;
  beforeEach(async () => {
    h = await harness();
    await h.givenJob({ status: "in_progress" });
  });

  const upload = (h: Harness, vehicleId = "veh-1") =>
    h.records.uploadEvidence("user-ada", "job-1", "device_installation", vehicleId, photo(PNG), NOW);

  it("removes the row and the file, audits, and unticks evidence when none is left", async () => {
    const first = await upload(h);
    const second = await upload(h);
    await h.orders.saveTick({ orderId: "job-1", itemKey: "capture_installation_evidence", checkedAt: NOW, checkedBy: "ada" });
    const [stored] = await h.orders.findEvidence("job-1");

    await h.records.deleteEvidence("user-ada", "job-1", first.id);
    expect(h.storage.delete).toHaveBeenCalledWith(stored.fileKey);
    expect((await h.orders.findTicks("job-1")).map((tick) => tick.itemKey)).toContain("capture_installation_evidence");

    await h.records.deleteEvidence("user-ada", "job-1", second.id);
    expect(await h.orders.findEvidence("job-1")).toEqual([]);
    expect((await h.orders.findTicks("job-1")).map((tick) => tick.itemKey)).not.toContain("capture_installation_evidence");
    expect(h.storage.delete).toHaveBeenCalledTimes(2);
    expect(h.activity.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "installer.job.evidence_removed",
        entityId: "job-1",
        metadata: { orderTenantId: "tenant-1", evidenceId: first.id, category: "device_installation", fileHash: stored.fileHash },
      }),
    );
  });

  it("unticks evidence when a vehicle loses its last photo but another still has one", async () => {
    await h.withSecondVehicle();
    const first = await upload(h, "veh-1");
    await upload(h, "veh-2");
    await h.orders.saveTick({ orderId: "job-1", itemKey: "capture_installation_evidence", checkedAt: NOW, checkedBy: "ada" });

    await h.records.deleteEvidence("user-ada", "job-1", first.id);
    expect(await h.orders.findEvidence("job-1")).toHaveLength(1);
    expect((await h.orders.findTicks("job-1")).map((tick) => tick.itemKey)).not.toContain("capture_installation_evidence");
  });

  it("answers another installer's job or an unknown photo as not found", async () => {
    const view = await upload(h);
    await expect(h.records.deleteEvidence("user-bola", "job-1", view.id)).rejects.toBeInstanceOf(InstallationJobNotFoundError);
    await expect(h.records.deleteEvidence("user-ada", "job-1", "nope")).rejects.toBeInstanceOf(InstallationJobNotFoundError);
    expect(h.storage.delete).not.toHaveBeenCalled();
  });

  it("refuses a completed or cancelled job", async () => {
    const view = await upload(h);
    await h.givenJob({ status: "completed" });
    await expect(h.records.deleteEvidence("user-ada", "job-1", view.id)).rejects.toBeInstanceOf(InstallationJobClosedError);
  });

  it("still removes the row when the file delete or the audit fails", async () => {
    const view = await upload(h);
    h.storage.delete.mockRejectedValueOnce(new Error("s3 down"));
    h.activity.record.mockRejectedValueOnce(new Error("audit down"));
    await h.records.deleteEvidence("user-ada", "job-1", view.id);
    expect(await h.orders.findEvidence("job-1")).toEqual([]);
  });
});

describe("starting device verification", () => {
  let h: Harness;
  beforeEach(async () => {
    h = await harness();
  });

  it("opens verification on the job's devices while in progress", async () => {
    await h.givenJob({ status: "in_progress" });
    await h.actions.verifyDevices("user-ada", "job-1");
    expect(h.fleet.beginVerification).toHaveBeenCalledWith(TENANT, ["dev-1"]);
  });

  it("treats skipped devices as success", async () => {
    await h.givenJob({ status: "in_progress" });
    h.fleet.beginVerification.mockResolvedValueOnce([{ deviceId: "dev-1", outcome: "skipped" as const }]);
    await expect(h.actions.verifyDevices("user-ada", "job-1")).resolves.toBeUndefined();
  });

  it("refuses outside in progress and with an unbound unit", async () => {
    await h.givenJob({ status: "scheduled" });
    await expect(h.actions.verifyDevices("user-ada", "job-1")).rejects.toBeInstanceOf(InstallationJobConflictError);
    await h.givenJob({ status: "in_progress" }, null);
    await expect(h.actions.verifyDevices("user-ada", "job-1")).rejects.toBeInstanceOf(InstallationJobConflictError);
    expect(h.fleet.beginVerification).not.toHaveBeenCalled();
  });

  it("answers another installer's job as not found", async () => {
    await h.givenJob({ status: "in_progress" });
    await expect(h.actions.verifyDevices("user-bola", "job-1")).rejects.toBeInstanceOf(InstallationJobNotFoundError);
  });

  it("surfaces a fleet refusal and an unreachable fleet", async () => {
    await h.givenJob({ status: "in_progress" });
    h.fleet.beginVerification.mockResolvedValueOnce([{ deviceId: "dev-1", outcome: "refused" as const, reason: "only a configured device can be verified" }]);
    await expect(h.actions.verifyDevices("user-ada", "job-1")).rejects.toThrow(/not configured yet.*only a configured device/);
    h.fleet.beginVerification.mockResolvedValueOnce(null as never);
    await expect(h.actions.verifyDevices("user-ada", "job-1")).rejects.toThrow("The device service could not be reached");
  });
});

describe("completing a job", () => {
  let h: Harness;
  beforeEach(async () => {
    h = await harness();
    await h.givenJob({ status: "in_progress" });
    h.fleetDevices.set("dev-1", device("dev-1", "verified"));
    await h.withEvidence();
  });

  it("completes with 15/15, hands the unit to fleet and advances the onboarding", async () => {
    await h.tickAll();
    await h.actions.complete("user-ada", "job-1", NOW);

    expect(await h.orders.findById("job-1")).toMatchObject({ status: "completed", completedAt: NOW });
    expect((await h.applications.findById("app-1"))?.stage).toBe("connectivity_verification");
    expect(h.fleet.handOver).toHaveBeenCalledWith(TENANT, {
      deviceId: "dev-1",
      vehicle: expect.objectContaining({ registrationNumber: "LSD-123-XA", model: "Actros 1844" }),
    });
  });

  it("refuses 14/15", async () => {
    await h.tickAll(["install_device"]);

    await expect(h.actions.complete("user-ada", "job-1", NOW)).rejects.toThrow("14/15");
    expect(await status(h)).toBe("in_progress");
  });

  it("rechecks both gates at completion", async () => {
    await h.tickAll();
    h.fleetDevices.set("dev-1", device("dev-1", "failed"));
    await expect(h.actions.complete("user-ada", "job-1", NOW)).rejects.toBeInstanceOf(InstallationJobConflictError);

    h.fleetDevices.set("dev-1", device("dev-1", "verified"));
    const bare = await harness();
    await bare.givenJob({ status: "in_progress" });
    bare.fleetDevices.set("dev-1", device("dev-1", "verified"));
    await bare.tickAll();
    await expect(bare.actions.complete("user-ada", "job-1", NOW)).rejects.toThrow("Upload at least one photo for each vehicle first");
    expect(h.fleet.handOver).not.toHaveBeenCalled();
    expect(bare.fleet.handOver).not.toHaveBeenCalled();
  });

  it("stays in progress when fleet refuses, and completes on retry", async () => {
    await h.tickAll();
    h.fleet.handOver.mockRejectedValueOnce(new FleetDeviceRefusedError("vehicle already has a GPS device assigned"));

    await expect(h.actions.complete("user-ada", "job-1", NOW)).rejects.toBeInstanceOf(FleetDeviceRefusedError);
    expect(await status(h)).toBe("in_progress");
    expect((await h.applications.findById("app-1"))?.stage).toBe("installation");

    await h.actions.complete("user-ada", "job-1", NOW);
    expect(await status(h)).toBe("completed");
  });

  it("hands over once when two completes race", async () => {
    await h.tickAll();
    const results = await Promise.allSettled([
      h.actions.complete("user-ada", "job-1", NOW),
      h.actions.complete("user-ada", "job-1", NOW),
    ]);

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.find((r) => r.status === "rejected")).toMatchObject({ reason: expect.any(InstallationJobConflictError) });
    expect(h.fleet.handOver).toHaveBeenCalledTimes(1);
    expect(await status(h)).toBe("completed");
  });

  it("refuses when the onboarding is not at installation", async () => {
    await h.tickAll();
    await h.applications.save(application("payment"));

    await expect(h.actions.complete("user-ada", "job-1", NOW)).rejects.toBeInstanceOf(InvalidStageTransitionError);
    expect(await status(h)).toBe("in_progress");
    expect(h.fleet.handOver).not.toHaveBeenCalled();
  });

  it("refuses a job that is not in progress", async () => {
    await h.givenJob({ status: "scheduled" });
    await h.tickAll();
    await expect(h.actions.complete("user-ada", "job-1", NOW)).rejects.toBeInstanceOf(InstallationJobConflictError);
  });
});

describe("the job detail while working", () => {
  it("shows checklist, evidence, notes, completion summary and actions", async () => {
    const h = await harness();
    await h.givenJob({ status: "in_progress", installerNotes: "Fitted under dash" });
    h.fleetDevices.set("dev-1", device("dev-1", "verified"));
    await h.withEvidence();
    await h.tickAll(["install_device"]);

    const detail = await h.jobs.detail("user-ada", "job-1");

    expect(detail.checklist).toMatchObject({ completed: 14, total: 15 });
    expect(detail.evidence).toHaveLength(1);
    expect(detail.evidence[0].vehicleId).toBe("veh-1");
    expect(detail.units[0].vehicle?.id).toBe("veh-1");
    expect(detail.notes).toBe("Fitted under dash");
    expect(detail.completion).toMatchObject({
      customer: "Lagos Express Logistics", vehicle: "LSD-123-XA", device: "Teltonika FMB920", vehicles: ["LSD-123-XA"],
      devices: ["Teltonika FMB920"], installationDate: "2026-09-25", installer: "ada Installer", checklist: "14/15",
      evidenceCount: 1, notes: "Fitted under dash",
    });
    expect(detail.actions).toEqual({
      canAccept: false, canStart: false, canComplete: false, canEditNotes: true, canUploadEvidence: true, canTick: true,
    });
  });

  it("serves the options", async () => {
    const h = await harness();
    const options = await h.jobs.options("user-ada");

    expect(options.checklist.flatMap((g) => g.items)).toHaveLength(15);
    expect(options.evidenceCategories).toEqual([{ key: "device_installation", label: "Device installation" }]);
    expect(options).not.toHaveProperty("timeSlots");
  });
});

describe("the job execution migration", () => {
  function sql(direction: "up" | "down"): string {
    const statements: string[] = [];
    const migration = Object.create(Migration20260924040000.prototype) as Migration20260924040000;
    Object.assign(migration, { addSql: (statement: string) => statements.push(statement) });
    void migration[direction]();
    return statements.join("\n");
  }

  it("adds notes, ticks unique per item, and evidence, and drops them on the way down", () => {
    expect(sql("up")).toMatch(/"installer_notes" text/);
    expect(sql("up")).toMatch(/primary key \("order_id", "item_key"\)/);
    expect(sql("up")).toMatch(/create table if not exists "installation_evidence"/);
    expect(sql("down")).toMatch(/drop table if exists "installation_checklist_ticks"/);
    expect(sql("down")).toMatch(/drop column if exists "installer_notes"/);
  });
});

describe("the per-vehicle evidence migration", () => {
  function sql(direction: "up" | "down"): string {
    const statements: string[] = [];
    const migration = Object.create(Migration20261127110000.prototype) as Migration20261127110000;
    Object.assign(migration, { addSql: (statement: string) => statements.push(statement) });
    void migration[direction]();
    return statements.join("\n");
  }

  it("adds a nullable vehicle, backfills single-unit orders only, and drops it on the way down", () => {
    expect(sql("up")).toMatch(/add column if not exists "vehicle_id" varchar\(64\) null/);
    expect(sql("up")).toMatch(/\) = 1/);
    expect(sql("down")).toMatch(/drop column if exists "vehicle_id"/);
  });
});
