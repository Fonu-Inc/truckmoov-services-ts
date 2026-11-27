import { Inject, Injectable } from '@nestjs/common';
import { AppConfigService } from '@shared/config';
import { getAuthOrm } from '@auth/session/infrastructure/persistence/auth-orm';

export type OwedAllocation = { applicationId: string; tenantId: string; owed: number };

type OwedRow = { application_id: string; tenant_id: string; owed: number | string };
type AlertedRow = { alerted_owed: number | string | null };

/** What each approved application is still owed, so a sweep can finish what approval could not. */
@Injectable()
export class ApplicationDeviceAllocationLedger {
  constructor(@Inject(AppConfigService) private readonly config: AppConfigService) {}

  private async connection() {
    if (this.config.persistence.backend === 'in-memory') return null;
    const orm = await getAuthOrm(this.config.db);
    return orm.em.getConnection();
  }

  async record(applicationId: string, tenantId: string, requested: number, owed: number): Promise<void> {
    const connection = await this.connection();
    if (!connection) return;
    await connection.execute(
      `insert into onboarding_device_allocations (application_id, tenant_id, requested, owed, created_at, updated_at)
       values (?, ?, ?, ?, now(), now())
       on conflict (application_id) do update set
         requested = excluded.requested,
         owed = excluded.owed,
         alerted_owed = case when excluded.owed = 0 then null else onboarding_device_allocations.alerted_owed end,
         updated_at = now()`,
      [applicationId, tenantId, requested, owed],
    );
  }

  async listOwed(limit: number): Promise<OwedAllocation[]> {
    const connection = await this.connection();
    if (!connection) return [];
    const rows = await connection.execute<OwedRow[]>(
      'select application_id, tenant_id, owed from onboarding_device_allocations where owed > 0 order by created_at asc, application_id asc limit ?',
      [limit],
    );
    return rows.map((row) => ({
      applicationId: row.application_id,
      tenantId: row.tenant_id,
      owed: Number(row.owed),
    }));
  }

  /** Fully supplied applications still held at provisioning, oldest first. */
  async listSuppliedAtProvisioning(limit: number): Promise<string[]> {
    const connection = await this.connection();
    if (!connection) return [];
    const rows = await connection.execute<{ application_id: string }[]>(
      `select l.application_id from onboarding_device_allocations l
       join onboarding_applications a on a.id = l.application_id
       where l.owed = 0 and a.status = 'approved' and a.stage = 'provisioning'
       order by l.created_at asc, l.application_id asc limit ?`,
      [limit],
    );
    return rows.map((row) => row.application_id);
  }

  async alertedOwed(applicationId: string): Promise<number | null> {
    const connection = await this.connection();
    if (!connection) return null;
    const [row] = await connection.execute<AlertedRow[]>(
      'select alerted_owed from onboarding_device_allocations where application_id = ?',
      [applicationId],
    );
    return row?.alerted_owed == null ? null : Number(row.alerted_owed);
  }

  async markAlerted(applicationId: string, owed: number): Promise<void> {
    const connection = await this.connection();
    if (!connection) return;
    await connection.execute(
      'update onboarding_device_allocations set alerted_owed = ? where application_id = ?',
      [owed, applicationId],
    );
  }
}
