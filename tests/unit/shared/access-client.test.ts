import { beforeEach, describe, expect, it, vi } from "vitest";
import axios from "axios";
import { AccessClient } from "@shared/access";

vi.mock("axios", () => ({ default: { get: vi.fn() } }));

const caller = { headers: () => ({ "x-service-token": "t" }) } as never;
const active = { userId: "u1", tenantId: "t1", portal: "tenant", active: true, permissions: ["tenant.vehicles.read"] };

describe("asking auth what a user may do", () => {
  beforeEach(() => vi.mocked(axios.get).mockReset());

  it("caches the answer", async () => {
    vi.mocked(axios.get).mockResolvedValue({ status: 200, data: { data: active } });
    const client = new AccessClient("http://auth", caller);

    await client.get("u1");
    expect(await client.get("u1")).toEqual(active);
    expect(axios.get).toHaveBeenCalledTimes(1);
  });

  it("knows a deleted user from an unreachable auth", async () => {
    vi.mocked(axios.get).mockResolvedValueOnce({ status: 404, data: { message: "user not found" } }).mockRejectedValueOnce(new Error("down"));
    const client = new AccessClient("http://auth", caller);

    expect(await client.get("gone")).toBeNull();
    expect(await client.get("other")).toBeUndefined();
  });

  it("does not cache a 404 that is not a missing user", async () => {
    vi.mocked(axios.get).mockResolvedValue({ status: 404, data: { message: "Cannot GET" } });
    const client = new AccessClient("http://auth", caller);

    expect(await client.get("u1")).toBeUndefined();
    expect(await client.get("u1")).toBeUndefined();
    expect(axios.get).toHaveBeenCalledTimes(2);
  });

  it("keeps the last known access when auth answers a 404 that is not a missing user", async () => {
    vi.useFakeTimers();
    try {
      const suspended = { ...active, active: false };
      vi.mocked(axios.get)
        .mockResolvedValueOnce({ status: 200, data: { data: suspended } })
        .mockResolvedValueOnce({ status: 404, data: { message: "Cannot GET" } });
      const client = new AccessClient("http://auth", caller);

      await client.get("u1");
      vi.advanceTimersByTime(31_000);

      expect(await client.get("u1")).toEqual(suspended);
    } finally {
      vi.useRealTimers();
    }
  });

  it("caches a missing user briefly", async () => {
    vi.mocked(axios.get).mockResolvedValue({ status: 404, data: { message: "user not found" } });
    const client = new AccessClient("http://auth", caller);

    await client.get("gone");
    await client.get("gone");
    expect(axios.get).toHaveBeenCalledTimes(1);
  });

  it("forgets a user the moment auth says they changed", async () => {
    vi.mocked(axios.get).mockResolvedValue({ status: 200, data: { data: active } });
    let handler: ((e: never) => Promise<void>) | undefined;
    const bus = { subscribeEveryInstance: async (_s: string, h: never) => void (handler = h) } as never;
    const client = new AccessClient("http://auth", caller);
    await client.listen(bus);
    await client.get("u1");

    await handler!({ data: { userId: "u1" } } as never);
    await client.get("u1");

    expect(axios.get).toHaveBeenCalledTimes(2);
  });
});
