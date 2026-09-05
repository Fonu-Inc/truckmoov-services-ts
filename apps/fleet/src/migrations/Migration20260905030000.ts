import { Migration } from '@mikro-orm/migrations';

export class Migration20260905030000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`alter table "fleet_vehicles" add column if not exists "capacity_unit" varchar(16) null;`);
    // Existing rows were captured in tons, which was the only unit the field
    // ever had. Stamping it keeps their meaning explicit now that it can vary.
    this.addSql(`update "fleet_vehicles" set "capacity_unit" = 'tons' where "capacity_unit" is null and "capacity" is not null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "fleet_vehicles" drop column if exists "capacity_unit";`);
  }
}
