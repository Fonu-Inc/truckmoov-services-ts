import { Migration } from "@mikro-orm/migrations";

/** Fleets: named groups of a tenant's vehicles. A vehicle may belong to more than one. */
export class Migration20261122150000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`create table if not exists "fleet_groups" (
      "id" varchar(64) primary key,
      "tenant_id" varchar(64) not null,
      "name" varchar(80) not null,
      "description" varchar(240) null,
      "violations_enabled" boolean not null default false,
      "created_at" timestamptz not null default now(),
      "updated_at" timestamptz not null default now()
    );`);
    this.addSql(`create unique index if not exists "fleet_groups_tenant_name_unique" on "fleet_groups" ("tenant_id", lower("name"));`);
    this.addSql(`create table if not exists "fleet_group_vehicles" (
      "fleet_id" varchar(64) not null references "fleet_groups" ("id") on delete cascade,
      "vehicle_id" varchar(64) not null,
      "tenant_id" varchar(64) not null,
      primary key ("fleet_id", "vehicle_id")
    );`);
    this.addSql(`create index if not exists "fleet_group_vehicles_vehicle_index" on "fleet_group_vehicles" ("tenant_id", "vehicle_id");`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "fleet_group_vehicles";`);
    this.addSql(`drop table if exists "fleet_groups";`);
  }
}
