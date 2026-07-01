import { Migration } from "@mikro-orm/migrations";

// Seeds a small global (non-tenant-scoped) reference catalog of SIM carriers and
// data bundles used by the device setup request flow — not tenant data.
export class Migration20260701000001 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      create table if not exists "fleet_carriers" (
        "id" varchar(255) not null primary key,
        "name" varchar(128) not null,
        "code" varchar(32) not null unique,
        "status" varchar(16) not null default 'active',
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now()
      );
    `);

    this.addSql(`
      create table if not exists "fleet_data_bundles" (
        "id" varchar(255) not null primary key,
        "carrier_id" varchar(64) not null,
        "name" varchar(128) not null,
        "plan_type" varchar(32) not null,
        "data_allowance_mb" int null,
        "price_ngn" numeric(14,2) not null,
        "status" varchar(16) not null default 'active',
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now()
      );
    `);
    this.addSql(`create index if not exists "fleet_data_bundles_carrier_idx" on "fleet_data_bundles" ("carrier_id");`);

    this.addSql(`
      insert into "fleet_carriers" ("id", "name", "code", "status") values
        ('carrier-mtn', 'MTN', 'mtn', 'active'),
        ('carrier-airtel', 'Airtel', 'airtel', 'active'),
        ('carrier-glo', 'Glo', 'glo', 'active'),
        ('carrier-9mobile', '9mobile', '9mobile', 'active')
      on conflict ("id") do nothing;
    `);

    this.addSql(`
      insert into "fleet_data_bundles" ("id", "carrier_id", "name", "plan_type", "data_allowance_mb", "price_ngn", "status") values
        ('bundle-mtn-monthly-1gb', 'carrier-mtn', 'MTN 1GB Monthly', 'monthly', 1024, 1000, 'active'),
        ('bundle-mtn-monthly-2gb', 'carrier-mtn', 'MTN 2GB Monthly', 'monthly', 2048, 1800, 'active'),
        ('bundle-airtel-monthly-1gb', 'carrier-airtel', 'Airtel 1GB Monthly', 'monthly', 1024, 1000, 'active'),
        ('bundle-airtel-monthly-2gb', 'carrier-airtel', 'Airtel 2GB Monthly', 'monthly', 2048, 1800, 'active'),
        ('bundle-glo-monthly-1gb', 'carrier-glo', 'Glo 1GB Monthly', 'monthly', 1024, 900, 'active'),
        ('bundle-9mobile-monthly-1gb', 'carrier-9mobile', '9mobile 1GB Monthly', 'monthly', 1024, 950, 'active')
      on conflict ("id") do nothing;
    `);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "fleet_data_bundles";`);
    this.addSql(`drop table if exists "fleet_carriers";`);
  }
}
