import { describe, expect, it, vi } from "vitest";
import { NigerianAddressError } from "@shared/nigeria";
import { UpdateOrganizationSettingsUseCase } from "../../../apps/auth/src/contexts/auth/session/application/use-cases/update-organization-settings.use-case";
import { UpdateOrganizationUserUseCase } from "../../../apps/auth/src/contexts/auth/session/application/use-cases/update-organization-user.use-case";
import { UpdateSystemSettingsUseCase } from "../../../apps/auth/src/update-system-settings.use-case";
import { buildDefaultSystemSettings } from "../../../apps/auth/src/system-settings.repository";
import { UpdateProfileUseCase } from "../../../apps/auth/src/contexts/auth/session/application/use-cases/update-profile.use-case";

const tokens = { resolveAccessToken: () => ({ id: "u1" }) };
const user = (role: string) => ({ id: "u1", email: "a@b.ng", tenantId: "t1", role, profile: { fullName: "Ada", phoneNumber: null, address: "1 Old Road", profilePictureUrl: null } });

function profile() {
  const users = { findById: vi.fn(async () => user("FLEET_ADMIN")), updateProfile: vi.fn(async () => undefined) };
  return { users, useCase: new UpdateProfileUseCase(tokens as never, users as never) };
}

describe("profile address", () => {
  it("trims and keeps a real address", async () => {
    const { useCase } = profile();

    await expect(useCase.execute({ accessToken: "t", address: "  27  Allen Avenue, Ikeja " })).resolves.toMatchObject({
      profile: { address: "27 Allen Avenue, Ikeja" },
    });
  });

  it("clears a blank address and leaves an omitted one alone", async () => {
    const { useCase } = profile();

    await expect(useCase.execute({ accessToken: "t", address: "  " })).resolves.toMatchObject({ profile: { address: null } });
    await expect(useCase.execute({ accessToken: "t", fullName: "Ada O" })).resolves.toMatchObject({ profile: { address: "1 Old Road" } });
  });

  it("does not judge a stored address that is only echoed back", async () => {
    const users = { findById: vi.fn(async () => ({ ...user("FLEET_ADMIN"), profile: { ...user("FLEET_ADMIN").profile, address: "x".repeat(250) } })), updateProfile: vi.fn(async () => undefined) };
    const useCase = new UpdateProfileUseCase(tokens as never, users as never);

    await expect(useCase.execute({ accessToken: "t", address: "x".repeat(250) })).resolves.toMatchObject({ profile: { address: "x".repeat(250) } });
  });

  it.each(["12", "123456", "x".repeat(201)])("refuses %s and writes nothing", async (address) => {
    const { useCase, users } = profile();

    await expect(useCase.execute({ accessToken: "t", address })).rejects.toBeInstanceOf(NigerianAddressError);
    expect(users.updateProfile).not.toHaveBeenCalled();
  });
});

describe("organisation settings address", () => {
  function settings() {
    const repo = { findByTenantId: vi.fn(async () => null), save: vi.fn(async () => undefined) };
    const users = { findById: vi.fn(async () => user("ENTERPRISE_ADMIN")) };
    return { repo, useCase: new UpdateOrganizationSettingsUseCase(tokens as never, users as never, repo as never) };
  }

  it("saves a trimmed address and refuses one without a letter", async () => {
    const { useCase, repo } = settings();

    await expect(useCase.execute({ accessToken: "t", branding: { address: " 5  Marina, Lagos " } })).resolves.toMatchObject({ branding: { address: "5 Marina, Lagos" } });
    await expect(useCase.execute({ accessToken: "t", branding: { address: "12 Main Street, Houston, Texas" } })).rejects.toBeInstanceOf(NigerianAddressError);
    await expect(useCase.execute({ accessToken: "t", branding: { address: "5555" } })).rejects.toBeInstanceOf(NigerianAddressError);
    expect(repo.save).toHaveBeenCalledTimes(1);
  });
});

describe("organisation user address", () => {
  function member() {
    const target = { id: "u2", email: "b@b.ng", tenantId: "t1", role: "DRIVER", profile: { fullName: "Bola", phoneNumber: null, address: null, profilePictureUrl: null } };
    const users = {
      findById: vi.fn(async (id: string) => (id === "u1" ? user("ENTERPRISE_ADMIN") : target)),
      updateProfile: vi.fn(async () => undefined),
    };
    const sessions = { listUserActivity: vi.fn(async () => []) };
    return { users, useCase: new UpdateOrganizationUserUseCase(tokens as never, users as never, sessions as never) };
  }

  it("saves a trimmed address and refuses one without a letter", async () => {
    const { useCase, users } = member();

    await expect(useCase.execute({ accessToken: "t", targetUserId: "u2", address: " 3  Bode Thomas, Lagos " })).resolves.toMatchObject({ user: { profile: { address: "3 Bode Thomas, Lagos" } } });
    await expect(useCase.execute({ accessToken: "t", targetUserId: "u2", address: "3 Baker Street, London" })).rejects.toBeInstanceOf(NigerianAddressError);
    await expect(useCase.execute({ accessToken: "t", targetUserId: "u2", address: "123456" })).rejects.toBeInstanceOf(NigerianAddressError);
    expect(users.updateProfile).toHaveBeenCalledTimes(1);
  });
});

describe("system contact address", () => {
  it("keeps the current address for null or omitted and saves a real one", async () => {
    const settings = { ...buildDefaultSystemSettings(), profile: { contactPhone: "", contactAddress: "9 Old Street", logoUrl: null } };
    const repo = { get: async () => settings, save: vi.fn(async () => undefined) };
    const useCase = new UpdateSystemSettingsUseCase(
      { resolveAccessToken: () => ({ sub: "a1", tenantId: "system", role: "SYSTEM_ADMIN" }) } as never,
      { findById: async () => ({ id: "a1", email: "a@b.ng", role: "SYSTEM_ADMIN", status: "active", tenantId: "system" }) } as never,
      repo as never,
      { publish: async () => {} } as never,
    );

    const kept = await useCase.execute({ accessToken: "t", profile: { contactAddress: null as never } });
    expect(kept.data.profile.contactAddress).toBe("9 Old Street");

    const saved = await useCase.execute({ accessToken: "t", profile: { contactAddress: " 1  New Road, Kano " } });
    expect(saved.data.profile.contactAddress).toBe("1 New Road, Kano");
    await expect(useCase.execute({ accessToken: "t", profile: { contactAddress: "1234" } })).rejects.toBeInstanceOf(NigerianAddressError);
  });
});
