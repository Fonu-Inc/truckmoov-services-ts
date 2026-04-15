import { Migration } from '@mikro-orm/migrations';

export class Migration20260414200000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `create table if not exists "iot_sims" ("id" varchar(255) not null, "iccid" varchar(32) not null, "imsi" varchar(32) null, "msisdn" varchar(32) null, "carrier" varchar(64) not null, "plan" varchar(32) not null default 'iot_basic', "status" varchar(16) not null default 'registered', "tenant_id" varchar(64) null, "device_id" varchar(64) null, "data_usage_mb" numeric(12,2) not null default 0, "data_limit_mb" numeric(12,2) not null default 0, "sms_usage" int not null default 0, "sms_limit" int not null default 0, "monthly_cost_ngn" numeric(12,2) not null default 0, "activation_date" timestamptz null, "expiry_date" timestamptz null, "last_activity" timestamptz null, "signal_strength" int null, "network_type" varchar(16) null, "roaming" boolean not null default false, "fonu_sim_id" varchar(128) null, "fonu_status" varchar(32) null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), constraint "iot_sims_pkey" primary key ("id"));`,
    );
    this.addSql(
      `create unique index if not exists "iot_sims_iccid_unique" on "iot_sims" ("iccid");`,
    );
    this.addSql(
      `create index if not exists "iot_sims_tenant_id_index" on "iot_sims" ("tenant_id");`,
    );
    this.addSql(
      `create index if not exists "iot_sims_status_index" on "iot_sims" ("status");`,
    );
    this.addSql(
      `create index if not exists "iot_sims_carrier_index" on "iot_sims" ("carrier");`,
    );

    this.addSql(
      `create table if not exists "sim_provisioning_requests" ("id" varchar(255) not null, "tenant_id" varchar(64) not null, "tenant_name" varchar(160) not null, "request_type" varchar(32) not null default 'activation', "number_of_sims" int not null, "preferred_operator" varchar(64) not null, "requested_plan" varchar(32) not null, "requested_data_limit_mb" int not null, "deployment_timeline" varchar(32) null, "use_case" text null, "device_mapping_data" jsonb null, "status" varchar(16) not null default 'pending', "approved_by" varchar(64) null, "approved_by_name" varchar(160) null, "approved_at" timestamptz null, "rejected_reason" text null, "fonu_request_id" varchar(128) null, "fonu_response" jsonb null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), constraint "sim_provisioning_requests_pkey" primary key ("id"));`,
    );
    this.addSql(
      `create index if not exists "sim_provisioning_requests_tenant_id_index" on "sim_provisioning_requests" ("tenant_id");`,
    );
    this.addSql(
      `create index if not exists "sim_provisioning_requests_status_index" on "sim_provisioning_requests" ("status");`,
    );
    this.addSql(
      `create index if not exists "sim_provisioning_requests_created_at_index" on "sim_provisioning_requests" ("created_at");`,
    );

    this.addSql(
      `create table if not exists "sim_activation_batches" ("id" varchar(255) not null, "request_id" varchar(64) null, "tenant_id" varchar(64) not null, "tenant_name" varchar(160) not null, "activation_mode" varchar(16) not null default 'bulk', "quantity" int not null, "operator" varchar(64) not null, "requested_plan" varchar(32) not null, "data_limit_gb" numeric(8,2) not null default 1, "device_mapping_data" jsonb null, "status" varchar(32) not null default 'pending', "sims_activated" int not null default 0, "sims_failed" int not null default 0, "fonu_response" jsonb null, "created_by" varchar(64) null, "created_by_name" varchar(160) null, "started_at" timestamptz null, "completed_at" timestamptz null, "error_message" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), constraint "sim_activation_batches_pkey" primary key ("id"));`,
    );
    this.addSql(
      `create index if not exists "sim_activation_batches_tenant_id_index" on "sim_activation_batches" ("tenant_id");`,
    );
    this.addSql(
      `create index if not exists "sim_activation_batches_status_index" on "sim_activation_batches" ("status");`,
    );
    this.addSql(
      `create index if not exists "sim_activation_batches_request_id_index" on "sim_activation_batches" ("request_id");`,
    );
  }
}
