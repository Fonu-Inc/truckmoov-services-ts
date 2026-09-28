import type { MikroORM } from "@mikro-orm/core";
import { describe, expect, it } from "vitest";
import { runMigrationsExclusively } from "../../../libs/shared/db/src/migration-lock";

type Held = { id: string; __knex__disposed?: unknown };

function fakeOrm(migrate: () => Promise<void>) {
  const held: Held = { id: "locked-session" };
  const events: string[] = [];
  const knex = {
    raw(sql: string) {
      const statement = {
        connection(conn: Held) {
          if (conn !== held) {
            throw new Error(`query used ${conn.id}, not the locked session`);
          }
          events.push(sql);
          return Promise.resolve();
        },
      };
      return statement;
    },
    client: {
      async acquireConnection() {
        events.push("acquire");
        return held;
      },
      async releaseConnection(conn: Held) {
        events.push(conn === held ? "release" : "release-other");
      },
    },
  };

  const orm = {
    em: { getConnection: () => ({ getKnex: () => knex }) },
    getMigrator: () => ({ up: migrate }),
  } as unknown as MikroORM;

  return { orm, held, events };
}

describe("runMigrationsExclusively", () => {
  it("locks, migrates, and unlocks on the same checked-out connection", async () => {
    const fake = fakeOrm(async () => {
      fake.events.push("migrate");
    });

    await runMigrationsExclusively(fake.orm);

    expect(fake.events).toEqual([
      "acquire",
      "select pg_advisory_lock(?)",
      "migrate",
      "select pg_advisory_unlock(?)",
      "release",
    ]);
    expect(fake.held.__knex__disposed).toBeUndefined();
  });

  it("unlocks that same connection when migration throws", async () => {
    const fake = fakeOrm(async () => {
      fake.events.push("migrate");
      throw new Error("migration failed");
    });

    await expect(runMigrationsExclusively(fake.orm)).rejects.toThrow("migration failed");

    expect(fake.events).toEqual([
      "acquire",
      "select pg_advisory_lock(?)",
      "migrate",
      "select pg_advisory_unlock(?)",
      "release",
    ]);
  });

  it("does not return a connection that failed to unlock", async () => {
    const held: Held = { id: "locked-session" };
    const events: string[] = [];
    const knex = {
      raw(sql: string) {
        return {
          connection(conn: Held) {
            if (conn !== held) throw new Error("wrong connection");
            if (sql.includes("unlock")) return Promise.reject(new Error("unlock failed"));
            events.push(sql);
            return Promise.resolve();
          },
        };
      },
      client: {
        async acquireConnection() {
          return held;
        },
        async releaseConnection(conn: Held) {
          events.push(conn.__knex__disposed ? "release-disposed" : "release");
        },
      },
    };
    const orm = {
      em: { getConnection: () => ({ getKnex: () => knex }) },
      getMigrator: () => ({ up: async () => undefined }),
    } as unknown as MikroORM;

    await runMigrationsExclusively(orm);

    expect(events).toEqual(["select pg_advisory_lock(?)", "release-disposed"]);
    expect(held.__knex__disposed).toBeInstanceOf(Error);
  });
});
