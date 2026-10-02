import { Migration } from '@mikro-orm/migrations';

export class Migration20261006010000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`create table if not exists "tenant_quota_overrides" (
      "tenant_id" varchar(64) not null,
      "vehicles" int null,
      "drivers" int null,
      "devices" int null,
      "sims" int null,
      "updated_by" varchar(64) null,
      "updated_at" timestamptz not null default now(),
      constraint "tenant_quota_overrides_pkey" primary key ("tenant_id")
    );`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "tenant_quota_overrides";`);
  }
}
