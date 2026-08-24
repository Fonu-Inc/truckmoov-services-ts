import { Migration } from "@mikro-orm/migrations";
import {
  addChainColumnsSql,
  backfillChain,
  dropChainSql,
  sealChainSql,
} from "@shared/audit";

const TABLE = "activity_logs";

/**
 * Makes activity_logs append-only and tamper-evident.
 *
 * Runs its statements through execute() rather than addSql() because the
 * backfill computes SHA-256 in JavaScript between the DDL steps. Doing it in
 * SQL would need the pgcrypto extension, which is not guaranteed to be
 * installable on a managed database.
 */
export class Migration20260824010000 extends Migration {
  override async up(): Promise<void> {
    for (const sql of addChainColumnsSql(TABLE, "recorded_at")) {
      await this.execute(sql);
    }

    await backfillChain(this, TABLE, (row) => ({
      id: String(row.id),
      tenantId: String(row.tenant_id),
      action: String(row.action),
      entityType: String(row.entity_type),
      entityId: String(row.entity_id),
      actorId: row.actor_id === null || row.actor_id === undefined ? null : String(row.actor_id),
      actorRole: row.actor_role === null || row.actor_role === undefined ? null : String(row.actor_role),
      summary: row.summary === null || row.summary === undefined ? null : String(row.summary),
      metadata: row.metadata ?? {},
      occurredAt: new Date(row.occurred_at as string).toISOString(),
    }));

    for (const sql of sealChainSql(TABLE)) {
      await this.execute(sql);
    }
  }

  override async down(): Promise<void> {
    for (const sql of dropChainSql(TABLE)) {
      await this.execute(sql);
    }
  }
}
