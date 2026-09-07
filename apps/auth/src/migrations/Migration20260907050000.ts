import { Migration } from '@mikro-orm/migrations';

/**
 * Names on the audit row, for the cross-tenant audit screen.
 *
 * Denormalised rather than joined: an audit row must show the actor and tenant
 * as they were, not as they are now, and a join returns nothing at all once a
 * user is deleted.
 *
 * Deliberately outside the hash chain. The chain protects what happened — the
 * actor's id, the action, the resource, the metadata and the time. A name is a
 * lookup of an id the chain already covers, so tampering with it cannot
 * misattribute anything. The caller's IP address, which is not derivable from
 * anything else, goes into `metadata`, which the hash does cover.
 */
export class Migration20260907050000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`alter table "activity_logs" add column if not exists "actor_name" varchar(160) null;`);
    this.addSql(`alter table "activity_logs" add column if not exists "actor_email" varchar(254) null;`);
    this.addSql(`alter table "activity_logs" add column if not exists "tenant_name" varchar(200) null;`);
    this.addSql(
      `create index if not exists "activity_logs_actor_email_index" on "activity_logs" ("actor_email");`,
    );
    // The cross-tenant screen reads newest first across every tenant, which the
    // existing per-tenant indexes do not serve.
    this.addSql(
      `create index if not exists "activity_logs_occurred_at_desc_index" on "activity_logs" ("occurred_at" desc);`,
    );
  }

  override async down(): Promise<void> {
    this.addSql(`drop index if exists "activity_logs_occurred_at_desc_index";`);
    this.addSql(`drop index if exists "activity_logs_actor_email_index";`);
    this.addSql(`alter table "activity_logs" drop column if exists "tenant_name";`);
    this.addSql(`alter table "activity_logs" drop column if exists "actor_email";`);
    this.addSql(`alter table "activity_logs" drop column if exists "actor_name";`);
  }
}
