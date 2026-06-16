import { Migration } from '@mikro-orm/migrations';

export class Migration20260616120000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `create table if not exists "device_setup_requests" ("id" varchar(255) not null, "imei" varchar(32) not null, "manufacturer" varchar(64) not null, "model" varchar(64) not null, "connection_type" varchar(16) not null, "requester_name" varchar(160) not null, "needs_sim" boolean not null default false, "vehicle_plate" varchar(160) null, "location" varchar(255) null, "tenant_id" varchar(64) not null, "status" varchar(16) not null default 'pending_review', "assigned_to" varchar(64) null, "notes" text null, "preferred_install_date" timestamptz null, "rejected_reason" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), constraint "device_setup_requests_pkey" primary key ("id"));`,
    );
    this.addSql(
      `create index if not exists "device_setup_requests_tenant_id_index" on "device_setup_requests" ("tenant_id");`,
    );
    this.addSql(
      `create index if not exists "device_setup_requests_status_index" on "device_setup_requests" ("status");`,
    );
    this.addSql(
      `create index if not exists "device_setup_requests_created_at_index" on "device_setup_requests" ("created_at");`,
    );
  }
}
