import { Migration } from '@mikro-orm/migrations';

export class Migration20260906020000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`create table if not exists "fleet_driver_behavior_events" ("id" varchar(64) not null, "tenant_id" varchar(64) not null, "driver_id" varchar(64) not null, "vehicle_id" varchar(64) null, "type" varchar(32) not null, "severity" varchar(16) not null, "speed_kph" real null, "latitude" real null, "longitude" real null, "occurred_at" timestamptz not null, "created_at" timestamptz not null default now(), constraint "fleet_driver_behavior_events_pkey" primary key ("id"));`);
    this.addSql(`create index if not exists "fleet_driver_behavior_events_tenant_occurred_index" on "fleet_driver_behavior_events" ("tenant_id", "occurred_at");`);
    this.addSql(`create index if not exists "fleet_driver_behavior_events_driver_index" on "fleet_driver_behavior_events" ("tenant_id", "driver_id", "occurred_at");`);

    this.addSql(`create table if not exists "fleet_driver_fatigue_analyses" ("id" varchar(64) not null, "tenant_id" varchar(64) not null, "driver_id" varchar(64) not null, "score" int not null, "risk_level" varchar(16) not null, "driving_minutes" int not null default 0, "rest_compliance" int null, "indicators" jsonb not null default '[]'::jsonb, "recommendations" jsonb not null default '[]'::jsonb, "analysis" text not null default '', "data_quality" varchar(16) not null default 'partial', "analyzed_at" timestamptz not null, constraint "fleet_driver_fatigue_analyses_pkey" primary key ("id"));`);
    this.addSql(`create index if not exists "fleet_driver_fatigue_analyses_driver_index" on "fleet_driver_fatigue_analyses" ("tenant_id", "driver_id", "analyzed_at");`);

    this.addSql(`create table if not exists "fleet_geofence_alert_reads" ("id" varchar(64) not null, "tenant_id" varchar(64) not null, "alert_id" varchar(64) not null, "read_by" varchar(64) not null, "read_at" timestamptz not null default now(), constraint "fleet_geofence_alert_reads_pkey" primary key ("id"));`);
    this.addSql(`create unique index if not exists "fleet_geofence_alert_reads_unique" on "fleet_geofence_alert_reads" ("tenant_id", "alert_id", "read_by");`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "fleet_geofence_alert_reads";`);
    this.addSql(`drop table if exists "fleet_driver_fatigue_analyses";`);
    this.addSql(`drop table if exists "fleet_driver_behavior_events";`);
  }
}
