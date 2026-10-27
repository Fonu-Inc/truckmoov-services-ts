import type { MikroORM } from "@mikro-orm/core";

/**
 * A single advisory lock id for schema migration, shared by every service.
 *
 * All services migrate one database, so the lock has to be one lock. Two
 * services holding different ids would migrate concurrently and hit the same
 * race this exists to prevent.
 */
const MIGRATION_LOCK_ID = 8_246_113_070_001;

/**
 * How long a replica waits for another one's migration before giving up. The
 * pod then fails startup and restarts, instead of holding a database connection
 * indefinitely. It must stay below the startupProbe budget in the deployments.
 */
const LOCK_WAIT_MS = 120_000;

interface LockedClient {
  __knex__disposed?: unknown;
}

interface MigrationKnex {
  raw(sql: string, bindings?: readonly unknown[]): {
    connection(conn: LockedClient): Promise<unknown>;
  };
  client: {
    acquireConnection(): Promise<LockedClient>;
    releaseConnection(conn: LockedClient): Promise<unknown>;
  };
}

/**
 * Runs migrations with only one process doing so at a time.
 *
 * Every replica runs migrations at startup, and "create table if not exists" is
 * not safe against a concurrent create: two connections can both pass the
 * existence check, and the loser fails on the pg_type unique index rather than
 * on anything the migration itself did wrong. With five replicas starting
 * together, four crash and restart until one wins.
 *
 * pg_advisory_lock is session-scoped. A pooled execute checks a connection out
 * and returns it as soon as the statement finishes, so the lock stayed on
 * whichever session happened to run it, and the unlock usually ran on a
 * different one. The lock then lived until that idle session was destroyed.
 * Every other replica blocked inside its own lock call, holding a database
 * connection the whole time. Enough of those filled Postgres, and the next
 * boot waited on the Knex pool until acquire timed out.
 *
 * The lock and the unlock therefore run on one connection that stays checked
 * out for the whole migration. A crash still drops the session and frees the
 * lock. If the unlock itself fails, the connection is marked disposed so the
 * pool destroys it instead of handing the still-locked session out again.
 */
export async function runMigrationsExclusively(orm: MikroORM): Promise<void> {
  const knex = (
    orm.em.getConnection() as unknown as { getKnex(): MigrationKnex }
  ).getKnex();
  const client = await knex.client.acquireConnection();

  try {
    await acquireLock(knex, client);
    try {
      await orm.getMigrator().up();
    } finally {
      await knex
        .raw("select pg_advisory_unlock(?)", [MIGRATION_LOCK_ID])
        .connection(client)
        .catch((error: unknown) => {
          client.__knex__disposed = error;
        });
    }
  } finally {
    await knex.client.releaseConnection(client);
  }
}

/**
 * lock_timeout covers advisory locks, but it also covers the DDL the migration
 * runs, so it is set only around the wait and reset before migrating.
 */
async function acquireLock(knex: MigrationKnex, client: LockedClient): Promise<void> {
  await knex.raw(`set lock_timeout = ${LOCK_WAIT_MS}`).connection(client);
  try {
    await knex.raw("select pg_advisory_lock(?)", [MIGRATION_LOCK_ID]).connection(client);
  } finally {
    await knex
      .raw("reset lock_timeout")
      .connection(client)
      .catch((error: unknown) => {
        client.__knex__disposed = error;
      });
  }
}
