import { Migration } from '@mikro-orm/migrations';

export class Migration20260906010000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`create table if not exists "fleet_driver_consents" ("id" varchar(64) not null, "tenant_id" varchar(64) not null, "driver_id" varchar(64) not null, "channel" varchar(16) not null, "state" varchar(16) not null default 'unknown', "source" varchar(32) not null default 'operator', "requested_at" timestamptz null, "responded_at" timestamptz null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), constraint "fleet_driver_consents_pkey" primary key ("id"));`);
    this.addSql(`create unique index if not exists "fleet_driver_consents_driver_channel_unique" on "fleet_driver_consents" ("tenant_id", "driver_id", "channel");`);
    this.addSql(`create index if not exists "fleet_driver_consents_tenant_index" on "fleet_driver_consents" ("tenant_id");`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "fleet_driver_consents";`);
  }
}
