import "reflect-metadata";
import { describe, expect, it } from "vitest";
import { MikroORM, PostgreSqlDriver } from "@mikro-orm/postgresql";
import * as orm from "../../../apps/auth/src/contexts/onboarding/infrastructure/persistence/onboarding-orm";

async function sqlFor(where: object): Promise<string> {
  const schemas = Object.values(orm).filter((v) => v && typeof v === "object" && "meta" in (v as object));
  const db = await MikroORM.init({ driver: PostgreSqlDriver, dbName: "x", connect: false, entities: schemas as never, discovery: { warnWhenNoEntities: false } });
  return db.em.createQueryBuilder(orm.OnboardingPaymentRecord).select("*").where(where).getFormattedQuery();
}

describe("onboarding payment lookups skip wallet renewals", () => {
  it("rejects $not nested under a field", async () => {
    await expect(sqlFor({ applicationId: "a", reference: { $not: { $like: "RNW-%" } } })).rejects.toThrow(/not permitted/);
  });

  it("builds not (reference like 'RNW-%') from a top-level $not", async () => {
    const sql = await sqlFor({ applicationId: "a", $not: { reference: { $like: "RNW-%" } } });
    expect(sql).toMatch(/not \(.*reference.* like 'RNW-%'\)/i);
  });
});
