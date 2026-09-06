import { Migration } from "@mikro-orm/migrations";

/**
 * Public tracking links for one vehicle, shared with a customer.
 *
 * Only the token hash is stored: a leaked row shows that a link exists, not
 * how to open it. The link is scoped to a job and dies when that job does.
 */
export class Migration20260907040000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`create table if not exists "fleet_tracking_share_links" (
      "id" varchar(64) not null,
      "tenant_id" varchar(64) not null,
      "vehicle_id" varchar(64) not null,
      "job_id" varchar(64) null,
      "token_hash" varchar(128) not null,
      "created_by" varchar(64) not null,
      "created_at" timestamptz not null default now(),
      "expires_at" timestamptz not null,
      "revoked_at" timestamptz null,
      "last_viewed_at" timestamptz null,
      "view_count" int not null default 0,
      constraint "fleet_tracking_share_links_pkey" primary key ("id")
    );`);
    this.addSql(
      `create unique index if not exists "fleet_tracking_share_links_token_unique" on "fleet_tracking_share_links" ("token_hash");`,
    );
    this.addSql(
      `create index if not exists "fleet_tracking_share_links_vehicle_index" on "fleet_tracking_share_links" ("tenant_id", "vehicle_id");`,
    );
    this.addSql(
      `create index if not exists "fleet_tracking_share_links_job_index" on "fleet_tracking_share_links" ("job_id");`,
    );
    this.addSql(
      `create index if not exists "fleet_tracking_share_links_expiry_index" on "fleet_tracking_share_links" ("expires_at");`,
    );
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "fleet_tracking_share_links";`);
  }
}
