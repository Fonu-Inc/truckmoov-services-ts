import { Migration } from "@mikro-orm/migrations";

const TABLE = `"fleet_device_setup_requests"`;

// Approved requests had no payment step, so they land past it.
const FORWARD: Record<string, string> = {
  pending_review: "under_review",
  approved: "ready_for_installation",
  in_progress: "installation_in_progress",
  provisioned: "installation_in_progress",
  assigned: "completed",
};

// Lossy: the payment step and its neighbour both fold back into "approved".
const BACKWARD: Record<string, string> = {
  under_review: "pending_review",
  awaiting_payment: "approved",
  ready_for_installation: "approved",
  installation_in_progress: "in_progress",
  completed: "assigned",
};

function statusCase(expression: string, mapping: Record<string, string>): string {
  const whens = Object.entries(mapping).map(([from, to]) => `when '${from}' then '${to}'`);
  return `case ${expression} ${whens.join(" ")} else ${expression} end`;
}

function remapStatuses(mapping: Record<string, string>): string {
  const from = Object.keys(mapping).map((status) => `'${status}'`).join(", ");
  return `update ${TABLE} set "status" = ${statusCase(`"status"`, mapping)} where "status" in (${from});`;
}

function remapTimeline(mapping: Record<string, string>): string {
  const mapped = statusCase(`(e.entry->>'status')`, mapping);
  return `update ${TABLE} set "timeline" = (
    select coalesce(jsonb_agg(
      case when jsonb_typeof(e.entry) = 'object' and e.entry->>'status' is not null
        then jsonb_set(e.entry, '{status}', to_jsonb(${mapped}))
        else e.entry end
      order by e.ord), '[]'::jsonb)
    from jsonb_array_elements("timeline") with ordinality as e(entry, ord)
  ) where jsonb_typeof("timeline") = 'array';`;
}

/**
 * Device requests follow the design's Request Device flow: no hardware choice
 * from the tenant, a DVR reference, and the review, payment and installation
 * lifecycle.
 */
export class Migration20261003010000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`alter table ${TABLE} alter column "manufacturer" drop not null;`);
    this.addSql(`alter table ${TABLE} alter column "tracker_type" drop not null;`);
    this.addSql(`alter table ${TABLE} add column if not exists "reference_number" varchar(16) null;`);
    // Oldest first, so the backfill gives the same references on every database.
    this.addSql(`update ${TABLE} r set "reference_number" = 'DVR-' || (100000 + n.rn)::text
      from (select "id", row_number() over (order by "created_at", "id") as rn from ${TABLE} where "reference_number" is null) n
      where r."id" = n."id";`);
    this.addSql(`alter table ${TABLE} alter column "reference_number" set not null;`);
    this.addSql(`create unique index if not exists "fleet_device_setup_requests_reference_number_unique" on ${TABLE} ("reference_number");`);
    this.addSql(remapStatuses(FORWARD));
    this.addSql(remapTimeline(FORWARD));
    this.addSql(`alter table ${TABLE} alter column "status" set default 'under_review';`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table ${TABLE} alter column "status" set default 'pending_review';`);
    this.addSql(remapTimeline(BACKWARD));
    this.addSql(remapStatuses(BACKWARD));
    this.addSql(`drop index if exists "fleet_device_setup_requests_reference_number_unique";`);
    this.addSql(`alter table ${TABLE} drop column if exists "reference_number";`);
    // manufacturer and tracker_type stay nullable: requests made since have neither.
  }
}
