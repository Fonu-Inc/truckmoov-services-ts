import { Migration } from '@mikro-orm/migrations';

export class Migration20260324091500 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "fleet_vehicles" add column if not exists "vin" varchar(17) null;`);
    this.addSql(`alter table "fleet_vehicles" add column if not exists "make" varchar(64) null;`);
    this.addSql(`alter table "fleet_vehicles" add column if not exists "year" int null;`);
    this.addSql(`alter table "fleet_vehicles" add column if not exists "type" varchar(32) null;`);
    this.addSql(`alter table "fleet_vehicles" add column if not exists "capacity" float8 null;`);
    this.addSql(`create index if not exists "fleet_vehicles_tenant_id_vin_index" on "fleet_vehicles" ("tenant_id", "vin");`);
  }

}
