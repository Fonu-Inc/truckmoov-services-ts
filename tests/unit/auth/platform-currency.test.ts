import { describe, expect, it } from "vitest";
import {
  buildDefaultSystemSettings,
  normalizeSystemSettings,
  type SystemSettings,
} from "../../../apps/auth/src/system-settings.repository";
import { UpdateSystemSettingsUseCase } from "../../../apps/auth/src/update-system-settings.use-case";
import { GetExchangeRateUseCase } from "../../../apps/auth/src/get-exchange-rate.use-case";
import { UnsupportedPlatformCurrencyError } from "../../../apps/auth/src/platform-currency.errors";
import { buildDefaultOrganizationSettings } from "../../../apps/auth/src/contexts/auth/session/domain/ports/organization-settings.repository.port";

const ACTOR = { id: "admin-1", email: "admin@truckmoov.com", role: "SYSTEM_ADMIN" };

class FakeSettingsRepository {
  constructor(public settings: SystemSettings | null = null) {}

  async get() {
    return this.settings;
  }

  async save(settings: SystemSettings) {
    this.settings = settings;
  }
}

const tokenService = {
  resolveAccessToken: () => ({ sub: ACTOR.id, tenantId: "system", role: ACTOR.role }),
} as never;

const userRepository = {
  findById: async () => ({ ...ACTOR, status: "active", tenantId: "system" }),
} as never;

const publisher = { publish: async () => {} } as never;

function updateUseCase(repository: FakeSettingsRepository) {
  return new UpdateSystemSettingsUseCase(
    tokenService,
    userRepository,
    repository as never,
    publisher,
  );
}

describe("Platform currency", () => {
  it("defaults to Naira with conversion off", () => {
    const settings = buildDefaultSystemSettings();

    expect(settings.defaults.platformCurrency).toBe("NGN");
    expect(settings.features.internationalCurrency).toBe(false);
  });

  it("reads a row written before the flag existed as off", () => {
    const legacy = buildDefaultSystemSettings();
    // A row saved before either field existed carries neither.
    delete (legacy.features as Partial<SystemSettings["features"]>).internationalCurrency;
    delete (legacy.defaults as Partial<SystemSettings["defaults"]>).platformCurrency;

    const normalized = normalizeSystemSettings(legacy);

    expect(normalized.features.internationalCurrency).toBe(false);
    expect(normalized.defaults.platformCurrency).toBe("NGN");
  });

  it("keeps the other feature flags when filling a missing one", () => {
    const legacy = buildDefaultSystemSettings();
    legacy.features.maintenanceMode = true;
    legacy.features.allowNewTenantRegistration = false;
    delete (legacy.features as Partial<SystemSettings["features"]>).internationalCurrency;

    const normalized = normalizeSystemSettings(legacy);

    expect(normalized.features.maintenanceMode).toBe(true);
    expect(normalized.features.allowNewTenantRegistration).toBe(false);
    expect(normalized.features.internationalCurrency).toBe(false);
  });

  it("refuses a currency the platform does not support", async () => {
    const repository = new FakeSettingsRepository();

    await expect(() =>
      updateUseCase(repository).execute({
        accessToken: "token",
        defaults: { platformCurrency: "USD" },
      }),
    ).rejects.toBeInstanceOf(UnsupportedPlatformCurrencyError);

    // Nothing is written. A stored USD would relabel every Naira figure on the
    // platform without converting one of them.
    expect(repository.settings).toBeNull();
  });

  it("accepts Naira in any casing", async () => {
    const repository = new FakeSettingsRepository();

    await updateUseCase(repository).execute({
      accessToken: "token",
      defaults: { platformCurrency: "ngn" },
    });

    expect(repository.settings?.defaults.platformCurrency).toBe("NGN");
  });

  it("leaves the currency alone when the payload omits it", async () => {
    const repository = new FakeSettingsRepository();

    await updateUseCase(repository).execute({
      accessToken: "token",
      platformName: "Truckmoov NG",
    });

    expect(repository.settings?.defaults.platformCurrency).toBe("NGN");
  });

  it("reports Naira and no rate while conversion is off", async () => {
    const repository = new FakeSettingsRepository();
    const result = await new GetExchangeRateUseCase(repository as never).execute();

    expect(result.data.currency).toBe("NGN");
    expect(result.data.internationalCurrency).toBe(false);
    // Never a number. A caller handed an invented rate cannot tell it is wrong.
    expect(result.data.ngnPerUsd).toBeNull();
  });

  it("still returns no rate once the flag is switched on", async () => {
    const settings = buildDefaultSystemSettings();
    settings.features.internationalCurrency = true;
    const repository = new FakeSettingsRepository(settings);

    const result = await new GetExchangeRateUseCase(repository as never).execute();

    expect(result.data.internationalCurrency).toBe(true);
    // Turning the flag on does not conjure a rate. One has to be set, and the
    // machinery to set it is deliberately not built yet.
    expect(result.data.ngnPerUsd).toBeNull();
  });

  it("defaults a tenant to Naira, not dollars", () => {
    expect(buildDefaultOrganizationSettings("tenant-1").defaults.currency).toBe("NGN");
  });
});
