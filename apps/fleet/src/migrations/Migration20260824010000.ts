import { Migration } from "@mikro-orm/migrations";
import {
  addChainColumnsSql,
  backfillChain,
  dropChainSql,
  sealChainSql,
} from "@shared/audit";

const TABLE = "fleet_audit_logs";

/**
 * Makes fleet_audit_logs append-only and tamper-evident, with the same chain
 * format as the auth service uses. The two must agree: a shared verifier cannot
 * check both chains if they hash their rows differently.
 *
 * The table already carried "revoke update, delete from public". That does not
 * stop the app, which owns the table. The trigger added here does.
 */
export class Migration20260824010000 extends Migration {
  override async up(): Promise<void> {
    for (const sql of addChainColumnsSql(TABLE, "occurred_at")) {
      await this.execute(sql);
    }

    await backfillChain(this, TABLE, (row) => ({
      id: String(row.id),
      tenantId: String(row.tenant_id),
      action: String(row.action),
      entityType: String(row.entity_type),
      entityId: String(row.entity_id),
      actorId: row.actor_id === null || row.actor_id === undefined ? null : String(row.actor_id),
      actorRole: null,
      summary: null,
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
