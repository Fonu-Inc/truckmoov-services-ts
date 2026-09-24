import { beforeEach, describe, expect, it } from "vitest";
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

  function useCase() {
    return new ConfirmInstallationUseCase(
      applications,
      orders,
      { forTenant: async () => answer },
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

  async function givenOrder(stage: OnboardingStage) {
    await applications.save(application(stage));
    await orders.save({
      id: "order-1",
      orderNumber: "FP-INST-107439",
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
      installerId: "installer-abuja-1",
      status: "assigned",
      preExceptionStatus: null,
      assignedAt: NOW,
      acceptedAt: null,
      startedAt: null,
      completedAt: null,
      cancelledAt: null,
      createdAt: NOW,
      updatedAt: NOW,
    });
  }

  beforeEach(() => {
    applications = new InMemoryOnboardingApplicationRepository();
    orders = new InMemoryInstallationOrderRepository();
    answer = { total: 1, reporting: 1, devices: [device(true)] };
  });

  it("closes the onboarding when every device is reporting", async () => {
    await givenOrder("installation");

    const result = await useCase().execute("token");

    expect(result.data.stage).toBe("fleet_ready");
    expect(result.data.failures).toEqual([]);
    expect((await applications.findById("app-1"))?.stage).toBe("fleet_ready");
  });

  it("names the device that is silent instead of closing", async () => {
    await givenOrder("installation");
    answer = {
      total: 2,
      reporting: 1,
      devices: [device(true, "dev-1"), device(false, "dev-2")],
    };

    const result = await useCase().execute("token");

    expect(result.data.stage).toBe("connectivity_verification");
    expect(result.data.failures).toHaveLength(1);
    expect(result.data.failures[0].deviceId).toBe("dev-2");
    expect((await applications.findById("app-1"))?.stage).toBe(
      "connectivity_verification",
    );
  });

  it("does not close when the check could not be made at all", async () => {
    await givenOrder("installation");
    answer = null;

    const result = await useCase().execute("token");

    // Not asking is not the same as every device being silent.
    expect(result.data.stage).toBe("connectivity_verification");
    expect(result.message).toContain("could not be checked");
  });

  it("does not close when no devices are registered", async () => {
    await givenOrder("installation");
    answer = { total: 0, reporting: 0, devices: [] };

    const result = await useCase().execute("token");

    expect(result.data.stage).toBe("connectivity_verification");
  });

  it("can be retried after a failed check", async () => {
    await givenOrder("connectivity_verification");

    const result = await useCase().execute("token");

    expect(result.data.stage).toBe("fleet_ready");
  });

  it("marks the order completed when the customer confirms", async () => {
    await givenOrder("installation");

    await useCase().execute("token");

    const order = await orders.findByTenantId(TENANT_ID);
    expect(order?.status).toBe("completed");
    expect(order?.completedAt).not.toBeNull();
  });

  it("refuses an onboarding that has not reached installation", async () => {
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
