import { Migration } from "@mikro-orm/migrations";

/**
 * Owner-operators asking to become fleet providers.
 *
 * The vehicle cap is now enforced, so an owner-operator who outgrows it is
 * refused with no way forward. This is that way forward.
 *
 * The stated vehicle count is what the requester claimed at the time. It is
 * kept for the record and never used to decide: a request from three weeks ago
 * may no longer reflect the fleet, so the count is read live at review.
 */
export class Migration20260825030000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      create table if not exists "organisation_upgrade_requests" (
        "id" varchar(255) not null primary key,
        "tenant_id" varchar(64) not null,
        "from_organisation_type" varchar(32) not null,
        "to_organisation_type" varchar(32) not null,
        "reason" text not null,
        "stated_vehicle_count" int not null default 0,
        "status" varchar(16) not null default 'pending',
        "requested_by" varchar(128) not null,
        "requested_at" timestamptz not null default now(),
        "reviewed_by" varchar(128) null,
        "reviewed_at" timestamptz null,
        "reviewer_notes" text null,
        "vehicle_count_at_review" int null
      );
    `);
    this.addSql(
      `create index if not exists "organisation_upgrade_requests_status_idx" on "organisation_upgrade_requests" ("status", "requested_at");`,
    );
    // One open request per tenant. A second would let two reviewers promote the
    // same organisation twice.
    this.addSql(
      `create unique index if not exists "organisation_upgrade_requests_one_open" on "organisation_upgrade_requests" ("tenant_id") where "status" = 'pending';`,
    );
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "organisation_upgrade_requests";`);
  }
}
