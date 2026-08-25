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
 * Runs migrations with only one process doing so at a time.
 *
 * Every replica runs migrations at startup, and "create table if not exists" is
 * not safe against a concurrent create: two connections can both pass the
 * existence check, and the loser fails on the pg_type unique index rather than
 * on anything the migration itself did wrong. With five replicas starting
 * together, four crash and restart until one wins.
 *
 * pg_advisory_lock blocks the others until the first finishes. They then find
 * the migrations already recorded and do nothing, which is the intended
 * outcome. The lock is session-scoped and released explicitly, so a crash
 * mid-migration frees it when the connection drops.
 */
export async function runMigrationsExclusively(orm: MikroORM): Promise<void> {
  const connection = orm.em.getConnection();

  await connection.execute("select pg_advisory_lock(?)", [MIGRATION_LOCK_ID]);
  try {
    await orm.getMigrator().up();
  } finally {
    await connection
      .execute("select pg_advisory_unlock(?)", [MIGRATION_LOCK_ID])
      .catch(() => {
        // The lock dies with the session, so a failure to release it here
        // delays the next starter rather than deadlocking it.
      });
  }
}
