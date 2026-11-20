import { Migration } from "@mikro-orm/migrations";
import { ROLE_IDS, Role } from "@shared/rbac";

// Frozen historical role id from before the fleet-admin role was retired.
const RETIRED_FLEET_ROLE_ID = 5;
const ENTERPRISE_ADMIN_ID = ROLE_IDS[Role.ENTERPRISE_ADMIN];

const FROM_ENTERPRISE_APPLICATION = `select "tenant_id" from "onboarding_applications"
  where "applicant_type" = 'fleet_provider' and "tenant_id" is not null`;

function bootstrapAdminOf(table: string): string {
  return `update "${table}" as t
      set "role_id" = ${ENTERPRISE_ADMIN_ID}
     from "onboarding_applications" as a
    where a."applicant_type" = 'fleet_provider'
      and a."tenant_id" = t."tenant_id"
      and lower(a."business_email") = lower(t."email")
      and t."role_id" = ${RETIRED_FLEET_ROLE_ID}`;
}

/**
 * The public application form offers enterprise and owner operator, but the
 * enterprise applicant was stored as fleet_provider, so approval bootstrapped a
 * fleet provider tenant with a FLEET_ADMIN. Moves those tenants to enterprise.
 *
 * Scoped to tenants an application created: a fleet provider made from the
 * console or promoted from owner operator has no fleet_provider application
 * and stays as it is. Tenants are moved before the applications, since the
 * applications are what identify them. Only the applicant's own account is
 * moved: FLEET_ADMIN is invitable, so other holders in the tenant chose it.
 */
export class Migration20260930010000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`${bootstrapAdminOf("auth_users")};`);
    this.addSql(`${bootstrapAdminOf("auth_invites")} and t."status" = 'pending';`);

    this.addSql(
      `update "system_tenant_onboardings"
          set "organization_type" = 'enterprise',
              "bootstrap_role" = '${Role.ENTERPRISE_ADMIN}',
              "company" = jsonb_set("company", '{organizationType}', '"enterprise"')
        where "organization_type" = 'fleet_provider'
          and "tenant_id" in (${FROM_ENTERPRISE_APPLICATION});`,
    );

    this.addSql(
      `update "onboarding_applications"
          set "applicant_type" = 'enterprise'
        where "applicant_type" = 'fleet_provider';`,
    );
  }

  override async down(): Promise<void> {
    // Deliberately does nothing. The old value is no longer an applicant type,
    // so reverting would leave applications the code cannot read.
  }
}
