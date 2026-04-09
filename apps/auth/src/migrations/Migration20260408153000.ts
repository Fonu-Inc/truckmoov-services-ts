import { Migration } from '@mikro-orm/migrations';

export class Migration20260408153000 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "system_tenant_onboardings" ("id" varchar(255) not null, "tenant_id" varchar(64) not null, "invited_email" varchar(255) not null, "organization_type" varchar(64) not null, "bootstrap_role" varchar(64) not null, "status" varchar(32) not null default 'pending_activation', "company" jsonb not null, "subscription" jsonb not null, "device_provisioning" jsonb not null, "sim_assignment" jsonb not null, "features" jsonb not null, "created_by_user_id" varchar(64) not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), constraint "system_tenant_onboardings_pkey" primary key ("id"));`);
    this.addSql(`create unique index if not exists "system_tenant_onboardings_tenant_id_unique" on "system_tenant_onboardings" ("tenant_id");`);
    this.addSql(`create index if not exists "system_tenant_onboardings_tenant_id_index" on "system_tenant_onboardings" ("tenant_id");`);
    this.addSql(`create index if not exists "system_tenant_onboardings_invited_email_index" on "system_tenant_onboardings" ("invited_email");`);
  }

}
