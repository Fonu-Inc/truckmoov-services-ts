import { describe, expect, it } from "vitest";
import { PostgreSqlPlatform } from "@mikro-orm/postgresql";
import { pgTextArray } from "../../../libs/shared/db/src/pg-array";

describe("pgTextArray", () => {
  it("binds as one array, not the value list MikroORM makes of a plain array", () => {
    const sql = new PostgreSqlPlatform().formatQuery("select 1 where t = any(?::text[])", [pgTextArray(["a", "b"])]);
    expect(sql).toBe(`select 1 where t = any('{"a","b"}'::text[])`);
  });

  it("escapes quotes and backslashes inside values", () => {
    expect(pgTextArray(['x"y', "c\\d", "e,f"])).toBe('{"x\\"y","c\\\\d","e,f"}');
  });
});
