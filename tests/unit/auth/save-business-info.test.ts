import { describe, expect, it, vi } from "vitest";
import { NigerianAddressError } from "@shared/nigeria";
import { SaveBusinessInfoUseCase, type SaveBusinessInfoPayload } from "../../../apps/auth/src/save-business-info.use-case";

function harness() {
  const saved: unknown[] = [];
  const repo = { findByTenantId: vi.fn(async () => null), save: vi.fn(async (info: unknown) => void saved.push(info)) };
  const tokens = { resolveAccessToken: () => ({ id: "u1" }) };
  const users = { findById: vi.fn(async () => ({ id: "u1", tenantId: "t1", role: "FLEET_ADMIN" })) };
  const useCase = Reflect.construct(SaveBusinessInfoUseCase, [tokens, users, repo]) as SaveBusinessInfoUseCase;
  return { useCase, saved, repo };
}

const payload = (overrides: Partial<SaveBusinessInfoPayload> = {}): SaveBusinessInfoPayload => ({
  companyName: "Arne Haulage",
  registrationNumber: null,
  taxId: null,
  businessType: null,
  industry: null,
  addressLine1: "14 Admiralty Way",
  addressLine2: null,
  city: "Lekki",
  state: "Lagos",
  postalCode: null,
  country: "Nigeria",
  phone: null,
  email: null,
  billingEmail: null,
  website: null,
  yearEstablished: null,
  numberOfEmployees: null,
  ...overrides,
});

describe("saving business info", () => {
  it("stores the address in its canonical form", async () => {
    const { useCase, saved } = harness();

    await useCase.execute("token", payload({ state: "lagos state", country: " ng ", city: "  Lekki  ", addressLine1: " 14  Admiralty Way " }));

    expect(saved[0]).toMatchObject({ state: "Lagos", country: "Nigeria", city: "Lekki", addressLine1: "14 Admiralty Way" });
  });

  it("accepts a free-text city and a short second line", async () => {
    const { useCase, saved } = harness();

    await useCase.execute("token", payload({ city: "Lekki Phase 1", addressLine2: "2B" }));

    expect(saved[0]).toMatchObject({ city: "Lekki Phase 1", addressLine2: "2B" });
  });

  it("does not judge stored values that are only echoed back", async () => {
    const { useCase, saved, repo } = harness();
    repo.findByTenantId.mockResolvedValueOnce({ addressLine1: "1234", city: "<old>", state: "Texas", country: "Ghana" } as never);

    await useCase.execute("token", payload({ addressLine1: "1234", city: "<old>", state: "Texas", country: "Ghana" }));

    expect(saved[0]).toMatchObject({ addressLine1: "1234", city: "<old>", state: "Texas", country: "Ghana" });
  });

  it("stores blank address fields as null", async () => {
    const { useCase, saved } = harness();

    await useCase.execute("token", payload({ addressLine1: "  ", addressLine2: "", city: "", state: "", country: "" }));

    expect(saved[0]).toMatchObject({ addressLine1: null, addressLine2: null, city: null, state: null, country: null });
  });

  it.each([
    ["state", { state: "Texas" }],
    ["country", { country: "Ghana" }],
    ["city", { city: "<b>Lekki</b>" }],
    ["addressLine1", { addressLine1: "12345" }],
    ["addressLine2", { addressLine2: "x".repeat(201) }],
  ])("refuses a bad %s and stores nothing", async (field, overrides) => {
    const { useCase, saved } = harness();

    const error = (await useCase.execute("token", payload(overrides)).catch((e: unknown) => e)) as NigerianAddressError;

    expect(error).toBeInstanceOf(NigerianAddressError);
    expect(error.field).toBe(field);
    expect(saved).toHaveLength(0);
  });
});
