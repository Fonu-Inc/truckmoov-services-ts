import { describe, expect, it, vi } from "vitest";
import { InstallerLookupCache } from "../../../apps/auth/src/contexts/installation/infrastructure/persistence/installer-lookup-cache";
import type { StoredInstaller } from "@auth/installation";

const installer = (status: string) => ({ id: "ada", userId: "user-ada", status }) as unknown as StoredInstaller;

describe("InstallerLookupCache", () => {
  it("serves repeat lookups from memory until the installer is saved", async () => {
    const cache = new InstallerLookupCache();
    const load = vi.fn(async () => installer("active"));

    await cache.get("user-ada", load);
    await cache.get("user-ada", load);
    expect(load).toHaveBeenCalledTimes(1);

    cache.forget({ id: "ada", userId: "user-ada" });
    await cache.get("user-ada", load);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("does not keep a read that raced a save", async () => {
    const cache = new InstallerLookupCache();
    const stale = cache.get("user-ada", async () => {
      cache.forget({ id: "ada", userId: "user-ada" });
      return installer("active");
    });
    await stale;

    const load = vi.fn(async () => installer("suspended"));
    expect((await cache.get("user-ada", load))?.status).toBe("suspended");
  });

  it("expires entries and caps its size", async () => {
    const cache = new InstallerLookupCache(0, 1);
    const load = vi.fn(async () => installer("active"));
    await cache.get("user-ada", load);
    await cache.get("user-ada", load);
    expect(load).toHaveBeenCalledTimes(2);

    const small = new InstallerLookupCache(60_000, 1);
    await small.get("a", load);
    await small.get("b", load);
    await small.get("a", load);
    expect(load).toHaveBeenCalledTimes(5);
  });
});
