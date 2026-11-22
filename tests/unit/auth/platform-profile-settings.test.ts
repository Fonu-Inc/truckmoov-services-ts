import { describe, expect, it } from "vitest";
import {
  buildDefaultSystemSettings,
  normalizeSystemSettings,
  type SystemSettings,
} from "../../../apps/auth/src/system-settings.repository";
import { UpdateSystemSettingsUseCase } from "../../../apps/auth/src/update-system-settings.use-case";

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

function updateUseCase(repository: FakeSettingsRepository) {
  return new UpdateSystemSettingsUseCase(
    { resolveAccessToken: () => ({ sub: ACTOR.id, tenantId: "system", role: ACTOR.role }) } as never,
    { findById: async () => ({ ...ACTOR, status: "active", tenantId: "system" }) } as never,
    repository as never,
    { publish: async () => {} } as never,
  );
}

describe("Platform profile, support and display settings", () => {
  it("reads a row written before these settings existed with safe defaults", () => {
    const legacy = buildDefaultSystemSettings() as Partial<SystemSettings>;
    delete legacy.profile;
    delete legacy.support;
    delete (legacy.defaults as Partial<SystemSettings["defaults"]>).dateFormat;

    const normalized = normalizeSystemSettings(legacy as SystemSettings);

    expect(normalized.profile).toEqual({ contactPhone: "", contactAddress: "", logoUrl: null });
    expect(normalized.support).toEqual({ phone: "", responseTimeHours: 24 });
    expect(normalized.defaults.dateFormat).toBe("dd/MM/yyyy");
    expect(normalized.defaults.timeFormat).toBe("24h");
  });

  it("saves profile, support and display fields and keeps the rest", async () => {
    const repository = new FakeSettingsRepository(buildDefaultSystemSettings());

    const result = await updateUseCase(repository).execute({
      accessToken: "token",
      profile: { contactPhone: " +234 800 000 0000 ", logoUrl: "https://cdn.example.com/logo.png" },
      support: { responseTimeHours: 4 },
      defaults: { dateFormat: "yyyy-MM-dd", timeFormat: "12h", defaultTimeRange: "yesterday" },
    });

    expect(result.data.profile).toEqual({
      contactPhone: "+234 800 000 0000",
      contactAddress: "",
      logoUrl: "https://cdn.example.com/logo.png",
    });
    expect(result.data.support).toEqual({ phone: "", responseTimeHours: 4 });
    expect(result.data.defaults).toMatchObject({ dateFormat: "yyyy-MM-dd", timeFormat: "12h", defaultTimeRange: "yesterday" });
  });

  it("clears the logo when sent null or empty", async () => {
    const settings = buildDefaultSystemSettings();
    settings.profile.logoUrl = "https://cdn.example.com/logo.png";
    const repository = new FakeSettingsRepository(settings);

    await updateUseCase(repository).execute({ accessToken: "token", profile: { logoUrl: "" } });

    expect(repository.settings?.profile.logoUrl).toBeNull();
  });

  it.each([["javascript:alert(1)"], ["data:image/png;base64,AAAA"], ["not a link"]])(
    "refuses the logo link %s",
    async (logoUrl) => {
      const repository = new FakeSettingsRepository(buildDefaultSystemSettings());

      await expect(
        updateUseCase(repository).execute({ accessToken: "token", profile: { logoUrl } }),
      ).rejects.toThrow("logoUrl must be an http or https link");
    },
  );

  it("refuses values outside the allowed lists", async () => {
    const repository = new FakeSettingsRepository(buildDefaultSystemSettings());

    await expect(
      updateUseCase(repository).execute({ accessToken: "token", support: { responseTimeHours: 12 } }),
    ).rejects.toThrow("responseTimeHours must be one of: 4, 24, 48");
    await expect(
      updateUseCase(repository).execute({ accessToken: "token", defaults: { dateFormat: "d.M.y" } }),
    ).rejects.toThrow("dateFormat must be one of");
  });
});
