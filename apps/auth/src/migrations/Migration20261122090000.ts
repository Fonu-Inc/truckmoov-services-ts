import { Migration } from '@mikro-orm/migrations';

export class Migration20261122090000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      create table if not exists "telecom_master_requests" (
        "id" varchar(255) not null,
        "tenant_id" varchar(64) null,
        "organization_name" varchar(255) not null,
        "contact_email" varchar(255) not null,
        "application_id" varchar(255) null,
        "application_reference" varchar(64) not null,
        "msisdn" varchar(32) null,
        "sim_serial" varchar(64) null,
        "number_type" varchar(16) not null default 'new',
        "status" varchar(32) not null default 'not_selected',
        "mtn_reference" varchar(128) null,
        "failure_reason" text null,
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        constraint "telecom_master_requests_pkey" primary key ("id")
      );
    `);
    this.addSql(`create index if not exists "telecom_master_requests_tenant_id_idx" on "telecom_master_requests" ("tenant_id");`);
    this.addSql(`create index if not exists "telecom_master_requests_application_id_idx" on "telecom_master_requests" ("application_id");`);
    this.addSql(`create index if not exists "telecom_master_requests_status_idx" on "telecom_master_requests" ("status");`);

    this.addSql(`
      create table if not exists "telecom_master_events" (
        "id" varchar(255) not null,
        "request_id" varchar(255) not null,
        "action" varchar(64) not null,
        "detail" text null,
        "created_at" timestamptz not null default now(),
        constraint "telecom_master_events_pkey" primary key ("id")
      );
    `);
    this.addSql(`create index if not exists "telecom_master_events_request_id_idx" on "telecom_master_events" ("request_id");`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "telecom_master_events" cascade;`);
    this.addSql(`drop table if exists "telecom_master_requests" cascade;`);
  }
}
