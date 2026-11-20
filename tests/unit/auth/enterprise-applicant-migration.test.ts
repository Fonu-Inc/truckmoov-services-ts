import { describe, expect, it } from 'vitest';
import { Migration20260930010000 } from '../../../apps/auth/src/migrations/Migration20260930010000';

function queriesOf(): string[] {
  const migration = new Migration20260930010000(null as never, null as never);
  migration.up();
  return migration.getQueries().map((query) => String(query));
}

describe('enterprise applicant migration', () => {
  it('scopes every write to fleet_provider applications', () => {
    for (const query of queriesOf()) {
      expect(query).toContain(`"applicant_type" = 'fleet_provider'`);
    }
  });

  it("moves only the applicant's own fleet admin account", () => {
    const roleWrites = queriesOf().filter((query) => query.includes('auth_users') || query.includes('auth_invites'));

    expect(roleWrites).toHaveLength(2);
    for (const query of roleWrites) {
      expect(query).toContain('"role_id" = 5');
      expect(query).toContain('"business_email"');
    }
  });

  it('rewrites the applications last, after the tenants they identify', () => {
    expect(queriesOf().at(-1)).toContain('update "onboarding_applications"');
  });
});
