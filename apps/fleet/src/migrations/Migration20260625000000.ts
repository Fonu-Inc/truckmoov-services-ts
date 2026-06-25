import { Migration } from "@mikro-orm/migrations";

export class Migration20260625000000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      create table if not exists "fleet_device_setup_requests" (
        "id" varchar(255) not null,
        "tenant_id" varchar(64) not null,
        "requested_by_user_id" varchar(64) null,
        "organisation_name" varchar(255) null,
        "requesting_email" varchar(255) null,
        "manufacturer" varchar(64) not null,
        "model" varchar(64) null,
        "tracker_type" varchar(32) not null,
        "quantity" int not null default 1,
        "sim_required" boolean not null default false,
        "carrier_id" varchar(64) null,
        "plan_type" varchar(32) null,
        "bundle_id" varchar(64) null,
        "vehicle_id" varchar(64) null,
        "state" varchar(64) null,
        "city" varchar(64) null,
        "preferred_date" varchar(32) null,
        "preferred_time" varchar(32) null,
        "use_case" text not null,
        "notes" text null,
        "status" varchar(32) not null default 'pending_review',
        "timeline" jsonb not null default '[]',
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        constraint "fleet_device_setup_requests_pkey" primary key ("id")
      );
    `);

    this.addSql(`
      create index if not exists "fleet_device_setup_requests_tenant_id_status_index"
      on "fleet_device_setup_requests" ("tenant_id", "status");
    `);
    this.addSql(`
      create index if not exists "fleet_device_setup_requests_tenant_id_created_at_index"
      on "fleet_device_setup_requests" ("tenant_id", "created_at");
    `);
    this.addSql(`
      create index if not exists "fleet_device_setup_requests_vehicle_id_index"
      on "fleet_device_setup_requests" ("vehicle_id");
    `);
  }
}
