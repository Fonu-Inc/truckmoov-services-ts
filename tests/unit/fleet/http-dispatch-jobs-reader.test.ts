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
  };
  return new HttpDispatchJobsReader(config as any);
}

/** Mirrors Go pkg/http/auth_context.go resolveAuthClaims: re-sign parts[0], constant-compare. */
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

  it("signs a Go-verifiable 2-part service token", async () => {
    vi.mocked(axios.get).mockResolvedValue({ status: 200, data: { status: true, data: [] } });
    await buildReader().listJobs("tenant-9");

    const [, opts] = vi.mocked(axios.get).mock.calls[0];
    const auth = (opts as any).headers.Authorization as string;
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
