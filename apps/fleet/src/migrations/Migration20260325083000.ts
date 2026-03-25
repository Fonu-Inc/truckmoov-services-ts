import { Migration } from "@mikro-orm/migrations";

export class Migration20260325083000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table "fleet_drivers" add column if not exists "phone" varchar(32) null;`,
    );
    this.addSql(
      `alter table "fleet_drivers" add column if not exists "email" varchar(128) null;`,
    );
    this.addSql(
      `alter table "fleet_drivers" add column if not exists "license_expiry_date" varchar(32) null;`,
    );
    this.addSql(
      `alter table "fleet_drivers" add column if not exists "communication_preference" varchar(16) null;`,
    );
  }
}
