import { Migration } from '@mikro-orm/migrations';

/**
 * The fleet an application is applying for, and the registry identifiers the
 * automated checks run against.
 *
 * `contact_role` becomes nullable: the application form no longer asks for it.
 * Vehicle documents hang off `vehicle_id` because a licence belongs to one
 * vehicle, and the submit gate counts them per vehicle rather than per
 * application.
 */
export class Migration20260922010000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table "onboarding_applications" alter column "contact_role" drop not null;`,
    );
    this.addSql(
      `alter table "onboarding_applications" add column if not exists "rc_number" varchar(20) null;`,
    );
    this.addSql(
      `alter table "onboarding_applications" add column if not exists "tax_identification_number" varchar(24) null;`,
    );
    this.addSql(
      `alter table "onboarding_applications" add column if not exists "identification_type" varchar(32) null;`,
    );
    this.addSql(
      `alter table "onboarding_applications" add column if not exists "identification_number" varchar(24) null;`,
    );
    this.addSql(
      `create index if not exists "onboarding_applications_rc_number_index" on "onboarding_applications" ("rc_number");`,
    );
    this.addSql(
      `create index if not exists "onboarding_applications_tax_identification_number_index" on "onboarding_applications" ("tax_identification_number");`,
    );
    this.addSql(
      `create index if not exists "onboarding_applications_identification_number_index" on "onboarding_applications" ("identification_number");`,
    );

    this.addSql(`create table if not exists "onboarding_application_vehicles" (
      "id" varchar(64) not null,
      "application_id" varchar(64) not null,
      "registration_number" varchar(20) not null,
      "vehicle_type" varchar(32) not null,
      "make" varchar(80) not null,
      "model" varchar(80) not null,
      "year" int null,
      "engine_number" varchar(64) null,
      "chassis_number" varchar(64) null,
      "color" varchar(40) null,
      "engine_capacity" varchar(32) null,
      "odometer_reading" int null,
      "purchase_type" varchar(32) null,
      "purchase_type_other" varchar(120) null,
      "created_at" timestamptz not null default now(),
      "updated_at" timestamptz not null default now(),
      constraint "onboarding_application_vehicles_pkey" primary key ("id")
    );`);
    this.addSql(
      `create index if not exists "onboarding_application_vehicles_application_id_index" on "onboarding_application_vehicles" ("application_id");`,
    );
    // One registration per application: the import matches on it, so a
    // duplicate would make a re-upload create a second copy of one vehicle.
    this.addSql(
      `create unique index if not exists "onboarding_application_vehicles_registration_unique" on "onboarding_application_vehicles" ("application_id", "registration_number");`,
    );

    this.addSql(`create table if not exists "onboarding_device_requests" (
      "id" varchar(64) not null,
      "application_id" varchar(64) not null,
      "quantity" int not null default 1,
      "use_case" text not null,
      "notes" text null,
      "created_at" timestamptz not null default now(),
      "updated_at" timestamptz not null default now(),
      constraint "onboarding_device_requests_pkey" primary key ("id")
    );`);
    this.addSql(
      `create index if not exists "onboarding_device_requests_application_id_index" on "onboarding_device_requests" ("application_id");`,
    );

    this.addSql(
      `alter table "onboarding_application_documents" add column if not exists "vehicle_id" varchar(64) null;`,
    );
    this.addSql(
      `create index if not exists "onboarding_application_documents_vehicle_id_index" on "onboarding_application_documents" ("vehicle_id");`,
    );
  }

  override async down(): Promise<void> {
    this.addSql(
      `drop index if exists "onboarding_application_documents_vehicle_id_index";`,
    );
    this.addSql(
      `alter table "onboarding_application_documents" drop column if exists "vehicle_id";`,
    );
    this.addSql(`drop table if exists "onboarding_device_requests";`);
    this.addSql(`drop table if exists "onboarding_application_vehicles";`);
    this.addSql(
      `drop index if exists "onboarding_applications_identification_number_index";`,
    );
    this.addSql(
      `drop index if exists "onboarding_applications_tax_identification_number_index";`,
    );
    this.addSql(`drop index if exists "onboarding_applications_rc_number_index";`);
    this.addSql(
      `alter table "onboarding_applications" drop column if exists "identification_number";`,
    );
    this.addSql(
      `alter table "onboarding_applications" drop column if exists "identification_type";`,
    );
    this.addSql(
      `alter table "onboarding_applications" drop column if exists "tax_identification_number";`,
    );
    this.addSql(
      `alter table "onboarding_applications" drop column if exists "rc_number";`,
    );
  }
}
