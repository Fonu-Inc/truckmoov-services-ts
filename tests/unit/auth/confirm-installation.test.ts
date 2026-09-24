import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ConfirmInstallationUseCase,
  InMemoryInstallationOrderRepository,
  InstallationNotConfirmableError,
  NoInstallationOrderError,
  type TenantConnectivity,
} from "@auth/installation";
import { InMemoryOnboardingApplicationRepository } from "@auth/onboarding/infrastructure/persistence/in-memory-onboarding-application.repository";
import type { StoredOnboardingApplication } from "@auth/onboarding/domain/onboarding-application.repository";
import type { OnboardingStage } from "@auth/onboarding/domain/onboarding-stage";
import type { StoredInstallationOrder } from "@auth/installation/domain/installation-order.repository";

const TENANT_ID = "tenant-1";
const NOW = new Date("2026-09-22T10:00:00Z");

function application(stage: OnboardingStage): StoredOnboardingApplication {
  return {
    id: "app-1",
    reference: "APP-2026-ABCD",
    tokenHash: "hash",
    applicantType: "fleet_provider",
    organizationName: "Arne Logistics Ltd",
    businessEmail: "jane@arne.com",
    organizationPhone: "+2348000000000",
    contactFullName: "Jane Doe",
    contactRole: null,
    streetAddress: "Mazi Fedelis Street",
    city: "Abuja",
    state: "FCT",
    rcNumber: null,
    taxIdentificationNumber: null,
    identificationType: null,
    identificationNumber: null,
    m2mPlanCode: "m2m_standard",
    billingEmail: "billing@arne.com",
    billingEmailVerifiedAt: NOW,
    stage,
    emailVerifiedAt: NOW,
    phoneVerifiedAt: NOW,
    status: "approved",
    submittedAt: NOW,
    reviewedBy: "system",
    reviewedAt: NOW,
    decisionReason: null,
    tenantId: TENANT_ID,
    setupLinkStatus: "sent",
    setupLinkSentAt: NOW,
    setupLinkError: null,
    setupLinkAttempts: 1,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function device(reporting: boolean, id = "dev-1") {
  return {
    deviceId: id,
    imei: `3578941013${id.slice(-1)}`,
    manufacturer: "Teltonika",
    model: "FMB920",
    assignedVehicleId: "v1",
    reporting,
    lastSeen: reporting ? NOW.toISOString() : null,
    verificationStatus: reporting ? "verified" : "waiting",
  };
}

describe("Confirming an installation", () => {
  let applications: InMemoryOnboardingApplicationRepository;
  let orders: InMemoryInstallationOrderRepository;
  let answer: TenantConnectivity | null;
  let connectivity: { forDevices: ReturnType<typeof vi.fn> };

  function useCase() {
    return new ConfirmInstallationUseCase(
      applications,
      orders,
      connectivity,
      { resolveAccessToken: () => ({ id: "user-1", tenantId: TENANT_ID }) } as never,
      {
        findById: async () => ({
          id: "user-1",
          email: "jane@arne.com",
          passwordHash: "",
          role: "FLEET_ADMIN",
          tenantId: TENANT_ID,
        }),
      } as never,
    );
  }

  async function givenOrder(
    stage: OnboardingStage,
    status: StoredInstallationOrder["status"] = "completed",
    deviceIds: Array<string | null> = ["dev-1"],
  ) {
    await applications.save(application(stage));
    await orders.save({
      id: "order-1",
      orderNumber: "FL-1000",
      applicationId: "app-1",
      tenantId: TENANT_ID,
      scheduledDate: NOW,
      timeSlot: "morning",
      addressLine: "12 Mazi Fedelis Street",
      city: "Abuja",
      state: "FCT",
      siteContactName: "Jane Doe",
      siteContactPhone: "+2348000000000",
      notes: null,
      installerNotes: null,
      installerId: "installer-abuja-1",
      status,
      preExceptionStatus: null,
      assignedAt: NOW,
      acceptedAt: NOW,
      startedAt: NOW,
      issueReportedAt: null,
      completedAt: status === "completed" ? NOW : null,
      cancelledAt: null,
      createdAt: NOW,
      updatedAt: NOW,
    });
    await orders.replaceAssignments(
      "order-1",
      deviceIds.map((fleetDeviceId, index) => ({
        id: `unit-${index + 1}`,
        orderId: "order-1",
        deviceIndex: index + 1,
        vehicleId: `v${index + 1}`,
        fleetDeviceId,
        createdAt: NOW,
      })),
    );
  }

  beforeEach(() => {
    applications = new InMemoryOnboardingApplicationRepository();
    orders = new InMemoryInstallationOrderRepository();
    answer = { total: 1, reporting: 1, devices: [device(true)] };
    connectivity = { forDevices: vi.fn(async () => answer) };
  });

  it("closes the onboarding when every job device is reporting", async () => {
    await givenOrder("connectivity_verification");

    const result = await useCase().execute("token");

    expect(result.data.stage).toBe("fleet_ready");
    expect(result.data.failures).toEqual([]);
    expect((await applications.findById("app-1"))?.stage).toBe("fleet_ready");
  });

  it("checks only the job's own devices in the order's tenant", async () => {
    await givenOrder("connectivity_verification", "completed", ["dev-1", null, "dev-3"]);

    await useCase().execute("token");

    expect(connectivity.forDevices).toHaveBeenCalledWith(TENANT_ID, ["dev-1", "dev-3"]);
  });

  it("names the device that is silent and counts every device checked", async () => {
    await givenOrder("connectivity_verification", "completed", ["dev-1", "dev-2"]);
    answer = {
      total: 2,
      reporting: 1,
      devices: [device(true, "dev-1"), device(false, "dev-2")],
    };

    const result = await useCase().execute("token");

    expect(result.data).toMatchObject({ stage: "connectivity_verification", devicesChecked: 2, devicesReporting: 1 });
    expect(result.data.failures).toHaveLength(1);
    expect(result.data.failures[0].deviceId).toBe("dev-2");
    expect((await applications.findById("app-1"))?.stage).toBe("connectivity_verification");
  });

  it("counts a job device fleet no longer finds as not reporting", async () => {
    await givenOrder("connectivity_verification", "completed", ["dev-1", "dev-2"]);
    answer = { total: 1, reporting: 1, devices: [device(true, "dev-1")] };

    const result = await useCase().execute("token");

    expect(result.data).toMatchObject({ stage: "connectivity_verification", devicesChecked: 2, devicesReporting: 1 });
    expect(result.data.failures).toEqual([expect.objectContaining({ deviceId: "dev-2", reason: "Device not found on this account" })]);
    expect((await applications.findById("app-1"))?.stage).toBe("connectivity_verification");
  });

  it("does not close when the check could not be made at all", async () => {
    await givenOrder("connectivity_verification");
    answer = null;

    const result = await useCase().execute("token");

    // Not asking is not the same as every device being silent.
    expect(result.data.stage).toBe("connectivity_verification");
    expect(result.message).toContain("could not be checked");
  });

  it("does not close when the job has no devices", async () => {
    await givenOrder("connectivity_verification", "completed", [null]);

    const result = await useCase().execute("token");

    expect(result.data).toMatchObject({ stage: "connectivity_verification", devicesChecked: 0 });
    expect(connectivity.forDevices).not.toHaveBeenCalled();
  });

  it("no longer completes the order", async () => {
    await givenOrder("installation", "in_progress");

    await expect(useCase().execute("token")).rejects.toThrow("has not completed");
    expect((await orders.findByTenantId(TENANT_ID))?.status).toBe("in_progress");
    expect((await applications.findById("app-1"))?.stage).toBe("installation");
  });

  it("refuses an onboarding past or before connectivity verification", async () => {
    await givenOrder("payment");

    await expect(useCase().execute("token")).rejects.toBeInstanceOf(
      InstallationNotConfirmableError,
    );
  });

  it("refuses an account with no installation booked", async () => {
    await expect(useCase().execute("token")).rejects.toBeInstanceOf(
      NoInstallationOrderError,
    );
  });
});
