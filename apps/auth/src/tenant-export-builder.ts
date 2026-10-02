import { Inject, Injectable } from '@nestjs/common';
import { USER_REPOSITORY } from './contexts/auth/session';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import { INVOICE_REPOSITORY, type InvoiceRepository } from '@auth/onboarding/domain/invoice.repository';
import { buildExport } from './export.helper';
import { FleetFactsService, type TenantExportTable } from './fleet-facts.service';
import { SIM_REPOSITORY, type SimRepository } from './sim.repository';
import { buildZip } from './zip-archive';
import type { TenantExportScope } from './tenant-data-export.repository';

const INVOICE_PAGE = 200;
const SIM_LIMIT = 100_000;
const FLEET_SCOPES = ['vehicles', 'drivers', 'devices'] as const;
const ALL_SCOPES = ['vehicles', 'drivers', 'devices', 'sims', 'users', 'invoices'] as const;

type SingleScope = (typeof ALL_SCOPES)[number];

export class TenantExportSourceError extends Error {}

export type BuiltTenantExport = {
  fileName: string;
  contentType: string;
  body: Buffer;
  rowCounts: Record<string, number>;
};

const naira = (kobo: number) => kobo / 100;
const iso = (value: Date | null | undefined) => value?.toISOString() ?? null;

@Injectable()
export class TenantExportBuilder {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(SIM_REPOSITORY) private readonly sims: SimRepository,
    @Inject(INVOICE_REPOSITORY) private readonly invoices: InvoiceRepository,
    @Inject(FleetFactsService) private readonly fleet: FleetFactsService,
  ) {}

  async build(tenantId: string, scope: TenantExportScope, label: string): Promise<BuiltTenantExport> {
    const scopes = scope === 'all' ? ALL_SCOPES : [scope];
    const files: Array<{ name: string; data: Buffer }> = [];
    const rowCounts: Record<string, number> = {};

    for (const single of scopes) {
      const table = await this.table(tenantId, single);
      const csv = await buildExport('csv', table.columns, table.rows, single);
      files.push({ name: `${label}-${single}.csv`, data: csv.buffer });
      rowCounts[single] = table.rows.length;
    }

    if (files.length === 1) {
      return { fileName: files[0].name, contentType: 'text/csv; charset=utf-8', body: files[0].data, rowCounts };
    }
    return { fileName: `${label}-all.zip`, contentType: 'application/zip', body: buildZip(files), rowCounts };
  }

  private async table(tenantId: string, scope: SingleScope): Promise<TenantExportTable> {
    if ((FLEET_SCOPES as readonly string[]).includes(scope)) {
      const table = await this.fleet.tenantExportTable(tenantId, scope as (typeof FLEET_SCOPES)[number]);
      if (!table) throw new TenantExportSourceError(`The fleet service could not be reached for ${scope}`);
      return table;
    }
    if (scope === 'users') return this.userTable(tenantId);
    if (scope === 'sims') return this.simTable(tenantId);
    return this.invoiceTable(tenantId);
  }

  private async userTable(tenantId: string): Promise<TenantExportTable> {
    const users = await this.users.findAllByTenant(tenantId);
    return {
      columns: ['id', 'email', 'role', 'account_status', 'full_name', 'phone_number'],
      rows: users.map((user) => [
        user.id,
        user.email,
        user.role,
        user.accountStatus ?? 'enabled',
        user.profile?.fullName ?? null,
        user.profile?.phoneNumber ?? null,
      ]),
    };
  }

  private async simTable(tenantId: string): Promise<TenantExportTable> {
    const { items } = await this.sims.findAll({ tenantId, limit: SIM_LIMIT });
    return {
      columns: [
        'id', 'iccid', 'imsi', 'msisdn', 'carrier', 'plan', 'status', 'device_id', 'device_imei',
        'vehicle_id', 'data_usage_mb', 'data_limit_mb', 'monthly_cost_ngn', 'activation_date',
        'expiry_date', 'created_at',
      ],
      rows: items.map((sim) => [
        sim.id, sim.iccid, sim.imsi, sim.msisdn, sim.carrier, sim.plan, sim.status, sim.deviceId,
        sim.deviceImei, sim.vehicleId, sim.dataUsageMb, sim.dataLimitMb, sim.monthlyCostNgn,
        iso(sim.activationDate), iso(sim.expiryDate), iso(sim.createdAt),
      ]),
    };
  }

  private async invoiceTable(tenantId: string): Promise<TenantExportTable> {
    const rows: TenantExportTable['rows'] = [];
    for (let page = 1; ; page += 1) {
      const result = await this.invoices.listForTenant({ tenantId, scope: 'all', page, limit: INVOICE_PAGE });
      for (const { invoice, isRenewal } of result.items) {
        rows.push([
          invoice.number, invoice.status, isRenewal ? 'renewal' : 'first', invoice.issueDate, invoice.dueDate,
          naira(invoice.subtotalKobo), naira(invoice.discountKobo), naira(invoice.taxKobo),
          naira(invoice.totalKobo), naira(invoice.amountPaidKobo),
        ]);
      }
      if (result.items.length < INVOICE_PAGE) break;
    }
    return {
      columns: [
        'number', 'status', 'kind', 'issue_date', 'due_date', 'subtotal_ngn', 'discount_ngn', 'tax_ngn',
        'total_ngn', 'amount_paid_ngn',
      ],
      rows,
    };
  }
}
