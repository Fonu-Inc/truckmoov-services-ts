import { Migration } from "@mikro-orm/migrations";

/** Driver groups: named groups of a tenant's drivers. A driver may belong to more than one. */
export class Migration20261122170000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`create table if not exists "driver_groups" (
      "id" varchar(64) primary key,
      "tenant_id" varchar(64) not null,
      "name" varchar(80) not null,
      "description" varchar(240) null,
      "violations_enabled" boolean not null default false,
      "created_at" timestamptz not null default now(),
      "updated_at" timestamptz not null default now()
    );`);
    this.addSql(`create unique index if not exists "driver_groups_tenant_name_unique" on "driver_groups" ("tenant_id", lower("name"));`);
    this.addSql(`create table if not exists "driver_group_drivers" (
      "group_id" varchar(64) not null references "driver_groups" ("id") on delete cascade,
      "driver_id" varchar(64) not null,
      "tenant_id" varchar(64) not null,
      primary key ("group_id", "driver_id")
    );`);
    this.addSql(`create index if not exists "driver_group_drivers_driver_index" on "driver_group_drivers" ("tenant_id", "driver_id");`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "driver_group_drivers";`);
    this.addSql(`drop table if exists "driver_groups";`);
  }
}
