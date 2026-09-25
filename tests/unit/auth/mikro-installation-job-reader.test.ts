import { beforeEach, describe, expect, it, vi } from "vitest";

const execute = vi.fn(async (_sql: string, _params: unknown[]) => [] as unknown[]);

vi.mock("../../../apps/auth/src/contexts/auth/session/infrastructure/persistence/auth-orm", () => ({
  getAuthOrm: async () => ({ em: { getConnection: () => ({ execute }) } }),
}));

const { MikroInstallationJobReader } = await import(
  "../../../apps/auth/src/contexts/installation/infrastructure/persistence/mikro-installation-job.reader"
);

const reader = () => new MikroInstallationJobReader({ db: {} } as never);

describe("Postgres installation job reader", () => {
  beforeEach(() => execute.mockClear());

  it("searches every field in SQL, in the one list query", async () => {
    await reader().list({ installerId: "ada", statuses: ["completed"], search: " 50%_off " }, { page: 1, limit: 20 });

    expect(execute).toHaveBeenCalledTimes(1);
    const [sql, params] = execute.mock.calls[0];
    for (const column of ["o.order_number", "app.organization_name", "o.address_line", "o.city", "o.state", "sv.registration_number"]) {
      expect(sql).toContain(`${column} ilike ?`);
    }
    expect(sql).toContain("o.installer_id = ?");
    expect(params.filter((p) => p === "%50\\%\\_off%")).toHaveLength(6);
    expect(params.slice(0, 2)).toEqual(["ada", ["completed"]]);
  });

  it("reads the whole page, first vehicle and unit counts included, without a query per job", async () => {
    execute.mockResolvedValueOnce([]);
    await reader().list({ installerId: "ada" }, { page: 1, limit: 5000 });

    const [sql, params] = execute.mock.calls[0];
    expect(sql).toMatch(/left join lateral[\s\S]*left join lateral/);
    expect(params.slice(-2)).toEqual([5000, 0]);
  });
});
