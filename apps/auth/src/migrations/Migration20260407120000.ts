import { Migration } from '@mikro-orm/migrations';

export class Migration20260407120000 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "activity_logs" ("id" varchar(255) not null, "tenant_id" varchar(64) not null, "service" varchar(64) not null, "action" varchar(128) not null, "entity_type" varchar(64) not null, "entity_id" varchar(128) not null, "summary" varchar(255) not null, "actor_id" varchar(128) null, "actor_role" varchar(64) null, "metadata" jsonb not null default '{}', "occurred_at" timestamptz not null, "recorded_at" timestamptz not null default now(), constraint "activity_logs_pkey" primary key ("id"));`);
    this.addSql(`create index if not exists "activity_logs_tenant_id_index" on "activity_logs" ("tenant_id");`);
    this.addSql(`create index if not exists "activity_logs_service_index" on "activity_logs" ("service");`);
    this.addSql(`create index if not exists "activity_logs_action_index" on "activity_logs" ("action");`);
    this.addSql(`create index if not exists "activity_logs_entity_type_index" on "activity_logs" ("entity_type");`);
    this.addSql(`create index if not exists "activity_logs_entity_id_index" on "activity_logs" ("entity_id");`);
    this.addSql(`create index if not exists "activity_logs_actor_id_index" on "activity_logs" ("actor_id");`);
    this.addSql(`create index if not exists "activity_logs_occurred_at_index" on "activity_logs" ("occurred_at");`);
  }

}
