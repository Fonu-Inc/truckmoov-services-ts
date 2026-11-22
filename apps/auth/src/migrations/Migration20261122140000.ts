import { Migration } from "@mikro-orm/migrations";

/**
 * Returning customers and device fulfilment on applications, and the MTN
 * pickup points an applicant collects devices from.
 *
 * The pickup points are demo rows (is_demo, "(demo)" in the name) until MTN's
 * real Connect Store / Service Centre list is loaded; see docs/tech-debt.md.
 */
export class Migration20261122140000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`alter table "onboarding_applications" add column if not exists "returning_customer" boolean not null default false;`);
    this.addSql(`alter table "onboarding_applications" add column if not exists "fulfilment" jsonb null;`);

    this.addSql(`create table if not exists "pickup_locations" (
      "id" varchar(64) primary key,
      "state" varchar(64) not null,
      "area" varchar(80) not null,
      "name" varchar(160) not null,
      "address" varchar(240) null,
      "active" boolean not null default true,
      "is_demo" boolean not null default false,
      "position" int not null default 0
    );`);
    this.addSql(`create index if not exists "pickup_locations_state_area_index" on "pickup_locations" ("state", "area");`);

    const demo: Array<[string, string, string, string]> = [
      ["Lagos", "Ikeja", "MTN Connect Store Ikeja (demo)", "Obafemi Awolowo Way, Ikeja"],
      ["Lagos", "Lekki", "MTN Connect Store Lekki (demo)", "Admiralty Way, Lekki Phase 1"],
      ["Lagos", "Victoria Island", "MTN Service Centre Victoria Island (demo)", "Adeola Odeku Street, Victoria Island"],
      ["FCT", "Wuse", "MTN Connect Store Wuse (demo)", "Aminu Kano Crescent, Wuse 2"],
      ["FCT", "Garki", "MTN Service Centre Garki (demo)", "Ahmadu Bello Way, Garki"],
      ["Rivers", "Port Harcourt", "MTN Connect Store Port Harcourt (demo)", "Aba Road, Port Harcourt"],
      ["Oyo", "Ibadan", "MTN Connect Store Ibadan (demo)", "Ring Road, Ibadan"],
      ["Kano", "Kano Municipal", "MTN Service Centre Kano (demo)", "Murtala Mohammed Way, Kano"],
    ];
    // Messages from the landing page contact form; kept even if the email to support fails.
    this.addSql(`create table if not exists "contact_enquiries" (
      "id" varchar(64) primary key,
      "company_name" varchar(120) not null,
      "contact_name" varchar(120) not null,
      "email" varchar(254) not null,
      "message" text not null,
      "emailed_at" timestamptz null,
      "created_at" timestamptz not null default now()
    );`);

    demo.forEach(([state, area, name, address], index) => {
      this.addSql(
        `insert into "pickup_locations" ("id", "state", "area", "name", "address", "is_demo", "position")
         values ('demo-${index + 1}', '${state}', '${area}', '${name}', '${address}', true, ${index})
         on conflict ("id") do nothing;`,
      );
    });
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "contact_enquiries";`);
    this.addSql(`drop table if exists "pickup_locations";`);
    this.addSql(`alter table "onboarding_applications" drop column if exists "fulfilment";`);
    this.addSql(`alter table "onboarding_applications" drop column if exists "returning_customer";`);
  }
}
