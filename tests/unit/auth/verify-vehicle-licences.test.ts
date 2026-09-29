import { describe, expect, it, vi } from "vitest";
import { VerifyApplicationAutomaticallyUseCase } from "@auth/onboarding/application/use-cases/verify-application-automatically.use-case";

function vehicle(id: string, registrationNumber: string) {
  return { id, registrationNumber, chassisNumber: null };
}

function licence(vehicleId: string | null, documentType = "vehicle_license") {
  return { documentType, vehicleId };
}

function build(vehicles: ReturnType<typeof vehicle>[], documents: ReturnType<typeof licence>[]) {
  const verifyVehicleRegistration = vi.fn(async (query: { registrationNumber: string }) => ({
    check: "vehicle_registration" as const,
    verdict: "not_found" as const,
    reference: query.registrationNumber,
    summary: "No vehicle is registered under this plate.",
    fields: [],
    provider: "test",
    checkedAt: new Date(),
  }));
  const registries = { verifyVehicleRegistration };
  const applications = {
    findVehiclesByApplicationId: vi.fn(async () => vehicles),
    findDocumentsByApplicationId: vi.fn(async () => documents),
  };
  const results = { replaceForApplication: vi.fn(async () => undefined) };
  const useCase = Reflect.construct(VerifyApplicationAutomaticallyUseCase, [
    applications,
    registries,
    results,
    {},
    {},
    { generate: () => "id" },
  ]) as VerifyApplicationAutomaticallyUseCase;
  return { useCase, verifyVehicleRegistration, results };
}

const application = {
  id: "a1",
  reference: "APP-1",
  applicantType: "owner_operator",
  contactFullName: "Ada Obi",
  organizationName: "Ada Obi",
  rcNumber: null,
  taxIdentificationNumber: null,
  identificationType: null,
  identificationNumber: null,
} as never;

describe("automatic verification of vehicle licences", () => {
  it("checks every vehicle that has a licence, each under its own plate", async () => {
    const { useCase, verifyVehicleRegistration } = build(
      [vehicle("v1", "LAG-111-AA"), vehicle("v2", "LAG-222-BB")],
      [licence("v1"), licence("v2")],
    );

    await useCase.execute(application);

    expect(verifyVehicleRegistration.mock.calls.map(([query]) => query.registrationNumber)).toEqual([
      "LAG-111-AA",
      "LAG-222-BB",
    ]);
  });

  it("leaves a vehicle with no licence unchecked", async () => {
    const { useCase, verifyVehicleRegistration } = build(
      [vehicle("v1", "LAG-111-AA"), vehicle("v2", "LAG-222-BB")],
      [licence("v2")],
    );

    await useCase.execute(application);

    expect(verifyVehicleRegistration).toHaveBeenCalledTimes(1);
    expect(verifyVehicleRegistration.mock.calls[0][0].registrationNumber).toBe("LAG-222-BB");
  });

  it("does not count another document type as a licence", async () => {
    const { useCase, verifyVehicleRegistration } = build(
      [vehicle("v1", "LAG-111-AA")],
      [licence("v1", "proof_of_ownership")],
    );

    await useCase.execute(application);

    expect(verifyVehicleRegistration).not.toHaveBeenCalled();
  });

  it("names the failing plate in the decision", async () => {
    const { useCase } = build([vehicle("v1", "LAG-111-AA")], [licence("v1")]);

    const { decision } = await useCase.execute(application);

    expect(decision.outcome).toBe("reject");
    expect(decision.reason).toContain("LAG-111-AA");
  });

  it("records one result per checked vehicle", async () => {
    const { useCase, results } = build(
      [vehicle("v1", "LAG-111-AA"), vehicle("v2", "LAG-222-BB")],
      [licence("v1"), licence("v2")],
    );

    await useCase.execute(application);

    const stored = (results.replaceForApplication.mock.calls[0] as unknown as [string, { reference: string }[]])[1];
    expect(stored.map((row) => row.reference)).toEqual(["LAG-111-AA", "LAG-222-BB"]);
  });
});
