import { Migration } from '@mikro-orm/migrations';

/**
 * Tenant terminations.
 *
 * Every other tenant status is derived from whether its users are enabled, and
 * by that measure a terminated tenant is indistinguishable from a suspended
 * one. It also has to carry the reason, which the audit trail needs.
 */
export class Migration20260907060000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`create table if not exists "tenant_terminations" (
      "tenant_id" varchar(64) not null,
      "reason" text not null,
      "terminated_by" varchar(64) not null,
      "terminated_at" timestamptz not null default now(),
      "sims_deactivated" int not null default 0,
      "users_disabled" int not null default 0,
      constraint "tenant_terminations_pkey" primary key ("tenant_id")
    );`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "tenant_terminations";`);
  }
}
