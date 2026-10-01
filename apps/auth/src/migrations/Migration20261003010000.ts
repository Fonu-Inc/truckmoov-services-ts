import { Migration } from '@mikro-orm/migrations';

export class Migration20261003010000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`create table if not exists "tenant_suspensions" (
      "tenant_id" varchar(64) not null,
      "suspended_at" timestamptz not null default now(),
      "suspended_by" varchar(64) not null,
      "reason" text not null,
      constraint "tenant_suspensions_pkey" primary key ("tenant_id")
    );`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "tenant_suspensions";`);
  }
}
