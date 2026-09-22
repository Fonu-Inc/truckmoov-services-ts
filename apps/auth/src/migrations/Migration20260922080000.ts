import { Migration } from '@mikro-orm/migrations';

/**
 * Installers, and the fitting booked against an onboarding.
 *
 * One order per application: an installation is booked once, and a second row
 * would mean two installers dispatched against the same devices.
 */
export class Migration20260922080000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`create table if not exists "installers" (
      "id" varchar(64) not null,
      "full_name" varchar(120) not null,
      "email" varchar(254) not null,
      "phone_number" varchar(20) not null,
      "team" varchar(120) not null,
      "state" varchar(64) not null,
      "is_active" boolean not null default true,
      "created_at" timestamptz not null default now(),
      "updated_at" timestamptz not null default now(),
      constraint "installers_pkey" primary key ("id")
    );`);
    this.addSql(
      `create unique index if not exists "installers_email_unique" on "installers" ("email");`,
    );
    this.addSql(
      `create index if not exists "installers_state_index" on "installers" ("state");`,
    );

    this.addSql(`create table if not exists "installation_orders" (
      "id" varchar(64) not null,
      "order_number" varchar(32) not null,
      "application_id" varchar(64) not null,
      "tenant_id" varchar(64) not null,
      "scheduled_date" timestamptz not null,
      "time_slot" varchar(16) not null,
      "address_line" varchar(200) not null,
      "city" varchar(80) not null,
      "state" varchar(64) not null,
      "site_contact_name" varchar(80) not null,
      "site_contact_phone" varchar(20) not null,
      "notes" text null,
      "installer_id" varchar(64) null,
      "status" varchar(24) not null default 'scheduled',
      "completed_at" timestamptz null,
      "created_at" timestamptz not null default now(),
      "updated_at" timestamptz not null default now(),
      constraint "installation_orders_pkey" primary key ("id")
    );`);
    this.addSql(
      `create unique index if not exists "installation_orders_order_number_unique" on "installation_orders" ("order_number");`,
    );
    this.addSql(
      `create unique index if not exists "installation_orders_application_unique" on "installation_orders" ("application_id");`,
    );
    this.addSql(
      `create index if not exists "installation_orders_tenant_id_index" on "installation_orders" ("tenant_id");`,
    );
    this.addSql(
      `create index if not exists "installation_orders_installer_id_index" on "installation_orders" ("installer_id");`,
    );
    this.addSql(
      `create index if not exists "installation_orders_status_index" on "installation_orders" ("status");`,
    );

    this.addSql(`create table if not exists "installation_device_assignments" (
      "id" varchar(64) not null,
      "order_id" varchar(64) not null,
      "device_index" int not null,
      "vehicle_id" varchar(64) not null,
      "created_at" timestamptz not null default now(),
      constraint "installation_device_assignments_pkey" primary key ("id")
    );`);
    this.addSql(
      `create index if not exists "installation_device_assignments_order_id_index" on "installation_device_assignments" ("order_id");`,
    );
    // One device per vehicle, and one vehicle per device, enforced where it
    // cannot be talked around by a second request arriving at the same time.
    this.addSql(
      `create unique index if not exists "installation_device_assignments_device_unique" on "installation_device_assignments" ("order_id", "device_index");`,
    );
    this.addSql(
      `create unique index if not exists "installation_device_assignments_vehicle_unique" on "installation_device_assignments" ("order_id", "vehicle_id");`,
    );
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "installation_device_assignments";`);
    this.addSql(`drop table if exists "installation_orders";`);
    this.addSql(`drop table if exists "installers";`);
  }
}
