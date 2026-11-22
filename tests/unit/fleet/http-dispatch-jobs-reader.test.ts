import { describe, expect, it, vi, beforeEach } from "vitest";
import { createHmac } from "crypto";
import axios from "axios";
import { HttpDispatchJobsReader } from "../../../apps/fleet/src/contexts/fleet/dispatch/infrastructure/http-dispatch-jobs-reader";

vi.mock("axios", () => ({ default: { get: vi.fn() } }));

const SECRET = "shared-platform-secret";

function buildReader() {
  const config = {
    dispatch: { serviceUrl: "http://dispatch:3005" },
    auth: { jwtSecret: SECRET },
    identity: { legacySecret: SECRET, serviceTokenDir: "/nonexistent", serviceAuthDevSecret: "" },
  };
  return new HttpDispatchJobsReader(config as any);
}

function verifyGoToken(token: string) {
  const parts = token.split(".");
  expect(parts).toHaveLength(2);
  const [encodedPayload, signature] = parts;
  const expected = createHmac("sha256", SECRET).update(encodedPayload).digest("base64url");
  expect(signature).toBe(expected);
  return JSON.parse(Buffer.from(encodedPayload, "base64url").toString());
}

describe("HttpDispatchJobsReader", () => {
  beforeEach(() => vi.mocked(axios.get).mockReset());

  it("sends a Go-verifiable legacy token while the compatibility window is open", async () => {
    vi.mocked(axios.get).mockResolvedValue({ status: 200, data: { status: true, data: [] } });
    await buildReader().listJobs("tenant-9");

    const [, opts] = vi.mocked(axios.get).mock.calls[0];
    const auth = (opts as any).headers.authorization as string;
    expect(auth.startsWith("Bearer ")).toBe(true);

    const payload = verifyGoToken(auth.slice("Bearer ".length));
    expect(payload.role).toBe("DISPATCHER");
    expect(payload.tenantId).toBe("tenant-9");
    expect(payload.sub).toBeTruthy();
    expect(payload.email).toBeTruthy();
    expect(payload.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it("maps the dispatch envelope to domain jobs", async () => {
    vi.mocked(axios.get).mockResolvedValue({
      status: 200,
      data: {
        status: true,
        data: [
          { id: "j1", reference: "R1", status: "delivered", assigned_vehicle_id: "v1", amount_ngn: 75000, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-02T00:00:00Z" },
          { id: "j2", status: "created" },
        ],
      },
    });

    const jobs = await buildReader().listJobs("t1");
    expect(jobs).toHaveLength(2);
    expect(jobs[0]).toMatchObject({ id: "j1", amountNgn: 75000, assignedVehicleId: "v1", status: "delivered" });
    expect(jobs[1]).toMatchObject({ id: "j2", amountNgn: 0, assignedVehicleId: null });
  });

  it("degrades to empty list on non-2xx", async () => {
    vi.mocked(axios.get).mockResolvedValue({ status: 401, data: { message: "unauthorized" } });
    expect(await buildReader().listJobs("t1")).toEqual([]);
  });

  it("degrades to empty list on an unusable response shape", async () => {
    vi.mocked(axios.get).mockResolvedValue({ status: 200, data: { status: true, data: "boom" } });
    expect(await buildReader().listJobs("t1")).toEqual([]);
  });

  it("returns empty without a tenant", async () => {
    expect(await buildReader().listJobs("")).toEqual([]);
    expect(vi.mocked(axios.get)).not.toHaveBeenCalled();
  });
});

describe("HttpDispatchJobsReader paging", () => {
  beforeEach(() => vi.mocked(axios.get).mockReset());

  function page(ids: string[], pageNo: number, totalPages: number) {
    return {
      status: 200,
      data: { status: true, data: ids.map((id) => ({ id })), meta: { total: 0, page: pageNo, limit: 100, totalPages } },
    };
  }

  it("reads every page at the maximum page size", async () => {
    vi.mocked(axios.get)
      .mockResolvedValueOnce(page(["a", "b"], 1, 2))
      .mockResolvedValueOnce(page(["c"], 2, 2));

    const jobs = await buildReader().listJobs("t1", { status: "delivered" });

    expect(jobs.map((job) => job.id)).toEqual(["a", "b", "c"]);
    expect(vi.mocked(axios.get)).toHaveBeenCalledTimes(2);
    expect((vi.mocked(axios.get).mock.calls[1][1] as any).params).toEqual({ status: "delivered", page: 2, limit: 100 });
  });

  it("stops at the page cap", async () => {
    let n = 0;
    vi.mocked(axios.get).mockImplementation(async () => page([`x${n++}`], 1, 999));

    const jobs = await buildReader().listJobs("t1");

    expect(vi.mocked(axios.get)).toHaveBeenCalledTimes(50);
    expect(jobs).toHaveLength(50);
  });

  it("counts a job once when a new job shifts it onto the next page", async () => {
    vi.mocked(axios.get)
      .mockResolvedValueOnce(page(["a", "b"], 1, 2))
      .mockResolvedValueOnce(page(["b", "c"], 2, 2));

    const jobs = await buildReader().listJobs("t1");

    expect(jobs.map((job) => job.id)).toEqual(["a", "b", "c"]);
  });

  it("returns nothing rather than a partial list when a later page fails", async () => {
    vi.mocked(axios.get)
      .mockResolvedValueOnce(page(["a", "b"], 1, 3))
      .mockResolvedValueOnce({ status: 504, data: {} })
      .mockResolvedValueOnce(page(["c"], 3, 3));

    expect(await buildReader().listJobs("t1")).toEqual([]);
  });

  it("passes the status list, driver and vehicle filters to dispatch", async () => {
    vi.mocked(axios.get).mockResolvedValueOnce(page([], 1, 1));

    await buildReader().listJobs("t1", { status: "assigned,en-route", driverId: "d1", vehicleId: "v1" });

    expect((vi.mocked(axios.get).mock.calls[0][1] as any).params).toEqual({
      status: "assigned,en-route", driver_id: "d1", vehicle_id: "v1", page: 1, limit: 100,
    });
  });

  it("reads a single job, and null when dispatch has none", async () => {
    vi.mocked(axios.get)
      .mockResolvedValueOnce({ status: 200, data: { status: true, data: { id: "j1" } } })
      .mockResolvedValueOnce({ status: 404, data: {} });
    const reader = buildReader();

    expect((await reader.getJob("t1", "j1"))?.id).toBe("j1");
    expect(vi.mocked(axios.get).mock.calls[0][0]).toBe("http://dispatch:3005/dispatch/jobs/j1");
    expect(await reader.getJob("t1", "missing")).toBeNull();
  });
});
