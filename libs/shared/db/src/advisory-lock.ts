import type { MikroORM } from "@mikro-orm/core";

interface LockedClient {
  __knex__disposed?: unknown;
}

interface LockKnex {
  raw(sql: string, bindings?: readonly unknown[]): {
    connection(conn: LockedClient): Promise<{ rows?: Array<Record<string, unknown>> }>;
  };
  client: {
    acquireConnection(): Promise<LockedClient>;
    releaseConnection(conn: LockedClient): Promise<unknown>;
  };
}

export type ExclusiveResult<T> = { acquired: false } | { acquired: true; value: T };

/**
 * Runs `task` only if no other session holds the advisory lock, skipping
 * rather than waiting. Lock, task and unlock share one checked-out connection
 * because the lock is session-scoped; see migration-lock.ts.
 */
export async function runIfLockFree<T>(
  orm: MikroORM,
  lockId: number,
  task: () => Promise<T>,
): Promise<ExclusiveResult<T>> {
  const knex = (orm.em.getConnection() as unknown as { getKnex(): LockKnex }).getKnex();
  const client = await knex.client.acquireConnection();

  try {
    const result = await knex.raw("select pg_try_advisory_lock(?) as locked", [lockId]).connection(client);
    if (result.rows?.[0]?.locked !== true) return { acquired: false };

    try {
      return { acquired: true, value: await task() };
    } finally {
      await knex
        .raw("select pg_advisory_unlock(?)", [lockId])
        .connection(client)
        .catch((error: unknown) => {
          client.__knex__disposed = error;
        });
    }
  } finally {
    await knex.client.releaseConnection(client);
  }
}
