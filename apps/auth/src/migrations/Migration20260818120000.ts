import { Migration } from '@mikro-orm/migrations';

export class Migration20260818120000 extends Migration {
  override async up(): Promise<void> {
    // Collapse pre-existing duplicate pending invites, keeping the most recent
    // per (tenant_id, email) so the partial unique index can be created.
    this.addSql(`
      delete from "auth_invites" a
      using "auth_invites" b
      where a.status = 'pending'
        and b.status = 'pending'
        and a.tenant_id = b.tenant_id
        and a.email = b.email
        and (
          a.created_at < b.created_at
          or (a.created_at = b.created_at and a.id < b.id)
        );
    `);

    this.addSql(`
      create unique index if not exists "auth_invites_pending_tenant_email_uidx"
      on "auth_invites" (tenant_id, email)
      where status = 'pending';
    `);
  }

  override async down(): Promise<void> {
    this.addSql(
      `drop index if exists "auth_invites_pending_tenant_email_uidx";`,
    );
  }
}
